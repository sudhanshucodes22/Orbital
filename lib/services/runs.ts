/** Generation history, diffing and retry — the authorised read/write surface.
 *
 * ## The boundary for the Builder Workspace
 *
 * Everything the next milestone's UI needs is a function in `lib/services`,
 * and every one of them takes a `Session` and checks it. Nothing above this
 * layer touches a repository, and no component reaches a database:
 *
 *   submit generation      → services/generation.ts  startGeneration / reviseProject
 *   get generation state   → services/runs.ts        getRun
 *   get project files      → services/files.ts       listFiles / getFile
 *   get project revisions  → services/revisions      (RevisionRepository via getProject)
 *   get history            → services/runs.ts        listRuns
 *   compare revisions      → services/runs.ts        compareRevisions
 *   restore revision       → services/files.ts       restoreRevision
 *   retry generation       → services/runs.ts        retryRun
 *
 * The authorisation rule is uniform and worth stating once: a run, a revision
 * and a file are all reached *through their project*, and `getProject` is what
 * decides whether the caller may see it. A run id from another user's project
 * is therefore not a way in — the project check fails before anything is read.
 */
import type {
  GenerationRun,
  ProjectId,
  RevisionId,
  RunPage,
  RunQuery,
  Session,
  TreeDiff,
} from "../domain";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_RUN_PAGE_SIZE,
  MAX_RUN_PAGE_SIZE,
  asGenerationId,
  asProjectId,
  diffTrees,
} from "../domain";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { getContainer } from "../server/container";
import { getProject } from "./projects";

/** History for a project, paginated and filterable.
 *
 * The page size is clamped here rather than trusted from the caller: an
 * unbounded limit is a way to ask the database for everything, and the caller
 * is ultimately a URL parameter.
 */
export async function listRuns(
  session: Session,
  projectId: ProjectId,
  options: Omit<RunQuery, "projectId"> = {}
): Promise<RunPage> {
  await getProject(session, projectId);
  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_RUN_PAGE_SIZE),
    MAX_RUN_PAGE_SIZE
  );
  return getContainer().runs.query({ ...options, projectId, limit });
}

/** The run currently occupying a project, if any.
 *
 * Server-side and persisted, which is the point: the generation panel only
 * knows about a run it started itself, so reloading the page mid-build, or
 * opening the project in a second tab, would otherwise show a project that
 * looks idle while work is in flight. The run row is the truth.
 */
export async function getActiveRun(
  session: Session,
  projectId: ProjectId
): Promise<GenerationRun | null> {
  await getProject(session, projectId);
  return getContainer().runs.findActive(projectId);
}

/** One run, scoped to a project the caller may see. */
export async function getRun(session: Session, runId: string): Promise<GenerationRun> {
  const run = await getContainer().runs.get(runId);
  if (!run) throw new NotFoundError("Run");
  // Throws if the run's project is not the caller's, which is the check that
  // matters — a run id must not be a way around project ownership.
  await getProject(session, run.projectId);
  return run;
}

/** What changed between two revisions of the same project.
 *
 * Both ids are resolved and both are checked against the project, so a
 * revision from elsewhere cannot be smuggled in as one side of the comparison
 * to read its contents.
 */
export async function compareRevisions(
  session: Session,
  projectId: ProjectId,
  fromRevisionId: RevisionId,
  toRevisionId: RevisionId
): Promise<TreeDiff> {
  await getProject(session, projectId);
  const container = getContainer();

  const [from, to] = await Promise.all([
    container.revisions.get(fromRevisionId),
    container.revisions.get(toRevisionId),
  ]);

  if (!from || from.projectId !== projectId) throw new NotFoundError("Revision");
  if (!to || to.projectId !== projectId) throw new NotFoundError("Revision");
  if (!from.tree || !to.tree) {
    throw new ValidationError(
      "One of these revisions predates tree snapshots, so it cannot be compared."
    );
  }

  return diffTrees(from.tree, to.tree);
}

/** Retries a failed run.
 *
 * A retry is a *new* run linked to the original, never an edit of it — the
 * failure stays in history, which is the whole point of recording it. The new
 * run carries the original's intent verbatim, so a retry re-runs the request
 * rather than a reconstruction of it.
 *
 * Idempotency is what makes a double-clicked retry safe. The new run's key
 * includes its attempt number, so:
 *
 *   - clicking retry twice on run 17 → both resolve to the same run 18
 *   - retrying run 18 after it also fails → a distinct run 19
 *
 * Without the attempt in the key, the first retry would collide with the
 * original run's key and silently return the failed run instead of starting
 * anything.
 */
export async function retryRun(session: Session, runId: string): Promise<GenerationRun> {
  const original = await getRun(session, runId);

  if (original.status !== "failed") {
    throw new ValidationError(
      `Only a failed run can be retried; this one is ${original.status}.`
    );
  }

  const container = getContainer();
  const projectId = asProjectId(original.projectId);

  // The retry inherits the lineage root, so a chain of retries all point at
  // the run that actually failed first rather than forming a linked list
  // nobody wants to walk.
  const rootId = original.retryOfRunId ?? original.id;
  const attempt = (original.attempt ?? 1) + 1;
  const key = `${original.idempotencyKey ?? original.id}::retry-${attempt}`;

  // Idempotency first: a second click rejoins the run the first one started,
  // rather than being refused by the concurrency check below.
  const existing = await container.runs.findByIdempotencyKey(projectId, key);
  if (existing) return existing;

  // The project must be free. A retry is a normal generation as far as the
  // one-active-run rule is concerned.
  const active = await container.runs.findActive(projectId);
  if (active) {
    throw new ConflictError(
      "This project already has a generation in progress. Wait for it to finish."
    );
  }

  // A generation id of its own, so the UI polls the retry rather than the
  // corpse of the run it replaces.
  const generationId = asGenerationId(randomUUID());

  const run = await container.runs.create({
    projectId,
    prompt: original.prompt,
    intent: original.intent,
    // Deliberately the *current* head, not the original's base: the project
    // may have moved on since the failure, and re-basing on a stale revision
    // would silently discard whatever happened in between.
    baseRevisionId: (await getProject(session, projectId)).currentRevisionId,
    generationId,
    mode: original.mode,
    idempotencyKey: key,
    retryOfRunId: rootId,
    attempt,
  });

  // Best-effort kick, and not a new mechanism: `generation.get` already
  // advances any run that is still active — "a poll is also a worker" — so
  // asking for the job's status is exactly what starts it. Not awaited, for
  // the same reason submit does not await its kick: if this request dies the
  // run stays queued and the worker picks it up. That is the durability
  // property, and it is why a retry does not depend on the browser staying
  // open.
  //
  // Wrapped rather than `void engine.get(...).catch(...)`: an adapter that
  // throws synchronously would escape a trailing `.catch`, and the run is
  // already durably queued by this point. A kick that fails must not fail the
  // retry — the worker is the guarantee, this is only the shortcut.
  void Promise.resolve()
    .then(() => container.generation.get(generationId))
    .catch(() => {
      // Swallowed deliberately: advance() records its own failure on the run,
      // and no caller is waiting on this promise.
    });

  return run;
}
