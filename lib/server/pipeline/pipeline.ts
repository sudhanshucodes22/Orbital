/** The durable generation pipeline. SERVER ONLY.
 *
 * One lifecycle, shared by every executor:
 *
 *   queued → running → validating → succeeded
 *                   ↘ failed / cancelled
 *
 * ## Why this is durable without a queue service
 *
 * Next has no durable background execution: a promise left running after a
 * server action returns is not guaranteed to finish, and Milestone 2 worked
 * around that by doing everything inline, which made the caller wait and tied
 * the work to one HTTP request.
 *
 * The fix here is that **the run row is the job**. `submit()` writes a queued
 * run and returns immediately. The work is done by `advance()`, which any
 * request may call — the fire-and-forget kick after submit, or the very next
 * poll. A worker takes a time-limited lease before doing anything; if the
 * process holding it dies, the lease expires and the next poll picks the work
 * up exactly where the row says it was. No request has to stay alive, and no
 * external queue is needed for a single-node deployment.
 *
 * ## Ordering guarantees
 *
 * Validation runs on the whole batch before a single byte is written, and a
 * revision is cut only after both validation and application succeed. There is
 * no path from invalid output to a successful revision.
 */
import {
  applyOperationsToTree,
  isActiveState,
  summariseValidation,
  treeAfter,
  validateOperations,
  type BuildPlan,
  type FailureStage,
  type FileSnapshot,
  type GeneratedSite,
  type GenerationEvent,
  type GenerationId,
  type GenerationIntent,
  type GenerationJob,
  type GenerationRun,
  type GenerationStatus,
  type InputArtifact,
  type Project,
  type ProjectId,
  type RunFailure,
  type SitePage,
  asGenerationId,
  asProjectId,
  hashContent,
} from "../../domain";
import { ConflictError, isNotConfigured } from "../../errors";
import { buildProjectContext } from "../../services/context";
import { getContainer, getWorkerContainer } from "../container";
import type { OperationProducer } from "./types";

/** How long a worker may hold a run before it is considered abandoned.
 *
 * Long enough for a slow model call, short enough that a crashed request does
 * not strand a project. A live worker never exceeds it silently: it finishes
 * or it fails, and either way the run reaches a terminal state. */
export const LEASE_MS = 5 * 60 * 1000;

/** How many times a rejected change may be sent back for repair.
 *
 * Two, deliberately. Each attempt is a real model call, and a producer that
 * cannot fix its output in two tries given the validator's exact complaint is
 * unlikely to fix it in five — at which point the honest answer is to fail and
 * let a person decide, not to keep spending. */
export const MAX_REPAIR_ATTEMPTS = 2;

function event(status: GenerationStatus, message: string): GenerationEvent {
  return { at: new Date().toISOString(), status, message };
}

export function instructionFrom(inputs: readonly InputArtifact[]): string {
  return inputs
    .filter((i): i is Extract<InputArtifact, { kind: "text" }> => i.kind === "text")
    .map((i) => i.text)
    .join("\n\n")
    .trim();
}

/** Stable key for "this exact request against this exact project state".
 *
 * Includes the base revision, so re-running the same prompt after a successful
 * generation produces a different key and is allowed — it is a genuinely
 * different request. Two clicks on one button are not.
 */
export function idempotencyKeyFor(
  projectId: ProjectId,
  baseRevisionId: string | null,
  instruction: string
): string {
  return hashContent(`${projectId}::${baseRevisionId ?? "none"}::${instruction}`);
}

/** The legacy `GeneratedSite` view, derived from the frozen tree.
 *
 * The preview route and the project page read `revision.site.pages`. Until
 * they read the tree directly, a revision carries both — but only the tree is
 * written, and this is computed from it, so the two cannot disagree.
 */
function siteFromTree(tree: readonly FileSnapshot[]): GeneratedSite {
  const routeFor = (path: string): string => {
    const base = path.replace(/\.html$/i, "");
    return base === "index" ? "/" : `/${base}`;
  };
  const titleOf = (source: string, fallback: string): string => {
    const match = source.match(/<title>([^<]*)<\/title>/i);
    return match?.[1]?.trim() || fallback;
  };

  const pages: SitePage[] = tree
    .filter((f) => /\.html$/i.test(f.path) && f.content !== null)
    .map((f) => ({
      path: routeFor(f.path),
      title: titleOf(f.content ?? "", f.path),
      source: f.content ?? "",
    }))
    .sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path)));

  const tokensFile = tree.find((f) => f.path === "design-tokens.json");
  let tokens: Record<string, string> = {};
  if (tokensFile?.content) {
    try {
      const parsed: unknown = JSON.parse(tokensFile.content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        tokens = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)])
        );
      }
    } catch {
      // A malformed tokens file is the generated project's problem, not a
      // reason to fail the revision that contains it.
    }
  }

  return { pages, assets: [], tokens, generatedAt: new Date().toISOString() };
}

/** Presents a run as the job shape the existing UI polls for. */
function jobOf(run: GenerationRun): GenerationJob {
  return {
    id: run.generationId ?? asGenerationId(run.id),
    projectId: run.projectId,
    intent: run.intent,
    status: run.status,
    events: [...run.events],
    producedRevisionId: run.producedRevisionId,
    error: run.error,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

/** Runs one queued run to a terminal state.
 *
 * Safe to call concurrently and safe to call on a run that is already
 * finished: the lease decides who does the work, and everyone else observes.
 *
 * Executes under the worker container, never the caller's. Three things call
 * this — the worker process, a poll, and the unawaited kick in `submit` — and
 * only one of them has a request scope, briefly. The kick outlives the request
 * that made it by design, so resolving cookie-backed repositories here meant
 * every Supabase generation died the moment that request returned. Identity is
 * a property of the work, not of who happened to start it: authorisation
 * already happened at submit.
 */
export async function advance(runId: string, producer: OperationProducer): Promise<GenerationRun> {
  const container = getWorkerContainer();

  const claimed = await container.runs.claim(runId, LEASE_MS);
  if (!claimed) {
    // Someone else holds a live lease, or the run is already terminal.
    const current = await container.runs.get(runId);
    if (!current) throw new Error("Run disappeared while being claimed.");
    return current;
  }

  const events: GenerationEvent[] = [...claimed.events];
  const push = async (status: GenerationStatus, message: string) => {
    events.push(event(status, message));
    await container.runs.update(runId, { status, events });
  };

  const fail = async (stage: FailureStage, message: string, failure?: Partial<RunFailure>) => {
    events.push(event("failed", message));
    await container.runs.update(runId, {
      status: "failed",
      error: message,
      failure: { stage, message, ...failure },
      events,
      completedAt: new Date().toISOString(),
      leaseExpiresAt: null,
    });
    const project = await container.projects.get(claimed.projectId);
    await container.projects.update(claimed.projectId, {
      status: project?.currentRevisionId ? "ready" : "failed",
    });
  };

  let project: Project | null = null;
  try {
    project = await container.projects.get(claimed.projectId);
    if (!project) {
      await fail("persistence", "The project no longer exists.");
      return (await container.runs.get(runId))!;
    }

    await container.projects.update(claimed.projectId, { status: "generating" });
    await push("reading", "reading project context");

    // The caller already authorised this generation; the context service takes
    // a session for its own role check, so it gets one scoped to the project's
    // own owner. This widens nothing — it is the same principal.
    const context = await buildProjectContext(
      {
        user: {
          id: project.ownerId,
          email: "",
          displayName: null,
          avatarUrl: null,
          createdAt: project.createdAt,
        },
        activeWorkspaceId: project.workspaceId,
        expiresAt: new Date(Date.now() + LEASE_MS).toISOString(),
      },
      { projectId: claimed.projectId, prompt: claimed.prompt }
    );

    await push("understanding", "producing changes");

    let produced;
    // Tracked so a throw is attributed to the stage the producer was actually
    // in. Defaults to "generation" because that is where a producer spends
    // most of its time and is the safest thing to assume of a producer that
    // never says.
    let producerStage: FailureStage = "generation";
    // Held so a failure after planning still reports what Orbital intended.
    // The run where the plan is most useful is the one that did not finish.
    let plannedSoFar: BuildPlan | null = null;

    try {
      produced = await producer.produce({
        project,
        instruction: claimed.prompt,
        context,
        report: (message) => {
          events.push(event("building", message));
        },
        stage: (next) => {
          producerStage = next;
        },
        notePlan: (plan) => {
          plannedSoFar = plan;
        },
      });
    } catch (error) {
      const stage: FailureStage = isNotConfigured(error) ? "configuration" : producerStage;
      // Persisted before the failure is recorded, so the plan is on the run
      // whatever happened next.
      if (plannedSoFar) await container.runs.update(runId, { plan: plannedSoFar, events });
      await fail(stage, error instanceof Error ? error.message : "Generation failed.");
      return (await container.runs.get(runId))!;
    }

    await container.runs.update(runId, {
      plan: produced.plan,
      operations: produced.operations,
      model: produced.model,
      events,
    });

    /* ---- validation gate ------------------------------------------- */

    await push("validating", `validating ${produced.operations.length} operation(s)`);

    const existing = await container.files.list(claimed.projectId);
    const snapshots: FileSnapshot[] = existing.map((f) => ({
      path: f.path,
      kind: f.kind,
      content: f.content,
      storageKey: f.storageKey,
      hash: f.hash,
      byteSize: f.byteSize,
    }));

    /* ---- validation, with a bounded repair loop --------------------- */
    //
    // A rejected change gets at most MAX_REPAIR_ATTEMPTS chances to be fixed,
    // and only from a producer that can actually use a diagnosis. The bound is
    // the important part: an unbounded loop is an autonomous agent spending
    // money on a problem it may not be able to solve, and every attempt here
    // is a real model call.
    //
    // Nothing is applied until validation passes. A repair that also fails
    // leaves the project exactly as it was — the last working revision stays
    // the head, and the failure stays in history with the reasons attached.

    let validation = validateOperations(snapshots, produced.operations);
    let repairs = 0;

    while (!validation.valid && producer.repair && repairs < MAX_REPAIR_ATTEMPTS) {
      repairs++;
      await push(
        "validating",
        `change rejected (${summariseValidation(validation)}) — repair attempt ${repairs}`
      );

      try {
        produced = await producer.repair({
          project,
          instruction: claimed.prompt,
          context,
          report: (message) => events.push(event("building", message)),
          stage: (next) => {
            producerStage = next;
          },
          notePlan: (plan) => {
            plannedSoFar = plan;
          },
          rejected: produced.operations,
          validation,
          plan: produced.plan,
          attempt: repairs,
        });
      } catch (error) {
        // A repair that throws is not a validation failure; it is the
        // producer failing, and it is recorded as such.
        await fail(
          producerStage,
          error instanceof Error ? error.message : "The repair attempt failed."
        );
        return (await container.runs.get(runId))!;
      }

      await container.runs.update(runId, {
        plan: produced.plan,
        operations: produced.operations,
        model: produced.model,
        events,
      });

      validation = validateOperations(snapshots, produced.operations);
    }

    if (!validation.valid) {
      // Out of attempts, or a producer that cannot repair. Either way the
      // project is untouched.
      const exhausted = repairs > 0 ? ` after ${repairs} repair attempt(s)` : "";
      await fail("validation", `${summariseValidation(validation)}${exhausted}`, { validation });
      return (await container.runs.get(runId))!;
    }

    if (repairs > 0) {
      await push("validating", `repaired after ${repairs} attempt(s)`);
    }

    // Recorded whether or not it passed. Warnings on an applied change are
    // the validator's main output for a successful run, and discarding them
    // would make the checks invisible exactly when they are informative.
    await container.runs.update(runId, { validation });

    /* ---- apply, then freeze ---------------------------------------- */

    const applied = applyOperationsToTree(snapshots, produced.operations);
    if (applied.report.applied === 0) {
      // Validation passed but nothing landed. Treated as a failure rather than
      // an empty revision, for the same reason as the emptyBatch check.
      await container.runs.update(runId, { report: applied.report, events });
      await fail("validation", "No change was applied.");
      return (await container.runs.get(runId))!;
    }

    await container.files.applyBatch(claimed.projectId, applied.writes, applied.deletes);
    const tree = treeAfter(snapshots, applied);

    const revision = await container.revisions.create({
      projectId: claimed.projectId,
      parentId: claimed.baseRevisionId ?? project.currentRevisionId,
      generationId: claimed.generationId,
      summary: produced.plan.summary,
      site: siteFromTree(tree),
      tree,
    });

    await container.projects.update(claimed.projectId, {
      status: "ready",
      currentRevisionId: revision.id,
    });

    events.push(event("succeeded", `${applied.report.applied} file(s) written`));
    return await container.runs.update(runId, {
      status: "succeeded",
      report: applied.report,
      producedRevisionId: revision.id,
      events,
      completedAt: new Date().toISOString(),
      leaseExpiresAt: null,
    });
  } catch (error) {
    await fail("persistence", error instanceof Error ? error.message : "Generation failed.");
    return (await container.runs.get(runId))!;
  }
}

/** Builds a `GenerationEngine` over a producer.
 *
 * Both the demo and model engines are this function with a different argument,
 * which is the point: there is one architecture, not two.
 */
export interface PipelineOptions {
  /** Kick the work off in the background as soon as a run is queued.
   *
   * On by default, because in a single-node deployment the submitting request
   * is the fastest thing available to start the work. Turned off when
   * something else owns execution — an external worker, or a test that drives
   * `advance` itself and needs the run to sit in `queued` until it says so.
   *
   * Either way the run is durable: with the kick off, the next poll claims it. */
  autoStart?: boolean;
}

export function createPipelineEngine(
  producer: OperationProducer,
  options: PipelineOptions = {}
) {
  const autoStart = options.autoStart ?? true;
  return {
    async submit(projectId: ProjectId, intent: GenerationIntent): Promise<GenerationJob> {
      const container = getContainer();
      const project = await container.projects.get(asProjectId(projectId));
      if (!project) throw new Error("Project not found");

      const instruction = instructionFrom(intent.inputs ?? []);
      const baseRevisionId = intent.type === "revise" ? intent.baseRevisionId : null;
      const key = idempotencyKeyFor(projectId, baseRevisionId ?? project.currentRevisionId, instruction);

      // Idempotency first: a resubmitted request rejoins its original run
      // rather than being refused by the concurrency check below.
      const existing = await container.runs.findByIdempotencyKey(projectId, key);
      if (existing) return jobOf(existing);

      // One active generation per project. Chosen over queueing because a
      // second concurrent change to the same tree is almost always a mistake,
      // and telling the user immediately is more useful than silently holding
      // their request behind one they have forgotten about.
      const active = await container.runs.findActive(projectId);
      if (active && isActiveState(active.status)) {
        throw new ConflictError(
          "This project already has a generation in progress. Wait for it to finish."
        );
      }

      const generationId = asGenerationId(crypto.randomUUID());
      const run = await container.runs.create({
        projectId,
        prompt: instruction,
        baseRevisionId,
        generationId,
        mode: producer.mode,
        idempotencyKey: key,
        intent,
      });

      // Best-effort kick so work starts without waiting for a poll. If this
      // request dies mid-flight the run stays queued and the next poll claims
      // it — that is the durability property, and the reason this is not
      // awaited.
      if (autoStart) {
        void advance(run.id, producer).catch(() => {
          // Swallowed deliberately: advance() records its own failure on the
          // run, and there is no caller left to receive a rejection.
        });
      }

      return jobOf(run);
    },

    async get(id: GenerationId): Promise<GenerationJob | null> {
      const container = getContainer();
      const run = await container.runs.getByGenerationId(id);
      if (!run) return null;

      // A poll is also a worker. If the run is still active, this either takes
      // over abandoned work or observes whoever holds the lease.
      if (isActiveState(run.status)) {
        return jobOf(await advance(run.id, producer));
      }
      return jobOf(run);
    },

    async cancel(id: GenerationId): Promise<void> {
      const container = getContainer();
      const run = await container.runs.getByGenerationId(id);
      if (!run || !isActiveState(run.status)) return;
      await container.runs.update(run.id, {
        status: "cancelled",
        failure: { stage: "cancelled", message: "Cancelled." },
        completedAt: new Date().toISOString(),
        leaseExpiresAt: null,
      });
    },
  };
}
