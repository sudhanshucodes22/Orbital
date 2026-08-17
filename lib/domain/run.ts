/** A generation run: the record of one attempt to change a project.
 *
 * This sits beside `GenerationJob` in generation.ts rather than replacing it.
 * The job models "a build is in flight" and drives the existing event stream
 * in the UI; the run models "here is the plan, the operations it produced and
 * which model produced them". Merging the two now would mean editing the live
 * polling path, which is working. The run references the job by id, and the
 * job can be folded into it once the real engine replaces the demo one.
 */
import type { GenerationEvent, GenerationIntent, GenerationStatus } from "./generation";
import type { GenerationId, ProjectId, RevisionId, Timestamp } from "./ids";
import type { ApplyReport, FileOperation } from "./operation";
import type { ValidationResult } from "./validate";

/** One unit of intended work, produced before any file is touched.
 *
 * The plan exists so the model commits to what it is about to do while the
 * change is still cheap to reject — by a validator, or by a human. A system
 * that goes straight from prompt to file writes has nowhere to put review. */
/** What the request is, in the planner's judgement. Drives how the code
 *  generator is prompted: a "create" gets latitude, a "restyle" is told not to
 *  change structure. */
export type PlanIntent = "create" | "extend" | "modify" | "restyle" | "fix";

export const PLAN_INTENTS: readonly PlanIntent[] = [
  "create",
  "extend",
  "modify",
  "restyle",
  "fix",
];

/** What a step will do to its targets. Declared before the generator runs, so
 *  an operation that does not match its step is a detectable disagreement
 *  rather than a silent surprise. */
export type PlanAction = "create" | "update" | "delete";

export const PLAN_ACTIONS: readonly PlanAction[] = ["create", "update", "delete"];

export interface PlanStep {
  id: string;
  /** Imperative, user-readable: "Add a projects section to the home page". */
  title: string;
  action: PlanAction;
  /** Paths this step expects to touch. Advisory: used to scope context and to
   *  flag when a step wandered outside what it declared. */
  targets: readonly string[];
  rationale: string | null;
}

/** A dependency the plan says the project needs.
 *
 * Recorded, never installed — there is no execution environment. Surfacing it
 * on the run is what makes the gap visible instead of producing code that
 * imports a package which is not there. */
export interface PlannedDependency {
  name: string;
  version: string;
  dev: boolean;
  reason: string | null;
}

export interface PlannedConfigChange {
  path: string;
  key: string;
  value: string;
  reason: string | null;
}

export interface BuildPlan {
  intent: PlanIntent;
  /** One sentence on the whole change, shown before anything is applied. */
  summary: string;
  steps: readonly PlanStep[];
  /** True when the planner judged the request a fresh build rather than an
   *  edit. Drives whether context retrieval bothers reading the tree. */
  isInitialBuild: boolean;
  dependencies: readonly PlannedDependency[];
  configChanges: readonly PlannedConfigChange[];
  /** What the generator should verify once the change lands. Advisory in this
   *  milestone: recorded on the run, not yet executed. */
  validation: readonly string[];
  notes: string | null;
}

/** Which engine produced a run.
 *
 * Recorded per run so history cannot imply a model was involved when it was
 * not. The demo engine is a template and says so; only `model` runs went
 * through a provider. */
export type GenerationMode = "demo" | "model";

/** Where a run failed, and why.
 *
 * `stage` is the machine-readable part — it says which step broke without
 * anyone having to pattern-match a sentence. `message` is written for a user
 * and is the only part rendered.
 *
 * Nothing here may carry a credential. Provider errors are translated at the
 * adapter boundary before they reach this type precisely so an API key or a
 * raw upstream payload cannot end up persisted in a run row.
 */
export type FailureStage =
  | "configuration"
  | "context"
  | "planning"
  | "generation"
  | "validation"
  | "persistence"
  | "cancelled"
  | "unknown";

export interface RunFailure {
  stage: FailureStage;
  message: string;
  /** Validation detail, when the validator was the thing that refused. */
  validation?: ValidationResult;
}

/** Which model produced a run. Recorded per run, not read from config at
 *  display time, so history stays accurate after the configured model
 *  changes. */
export interface RunModelInfo {
  providerId: string;
  modelId: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface GenerationRun {
  id: string;
  projectId: ProjectId;
  /** The job driving status and events, when one exists. */
  generationId: GenerationId | null;
  /** The user's instruction, kept verbatim. The prompt history is context for
   *  later turns, so it must not be normalised away. */
  prompt: string;
  /** The original request. Persisted so a worker can do the work after the
   *  submitting request has gone away — a durable run must be resumable from
   *  its own row, not from whatever was in the caller's memory. */
  intent: GenerationIntent;
  /** The revision this run started from. Null for a first build. */
  baseRevisionId: RevisionId | null;
  /** The revision it produced. Null until it succeeds. */
  producedRevisionId: RevisionId | null;
  status: GenerationStatus;
  mode: GenerationMode;
  /** Deduplicates accidental double submissions. Derived from the project, the
   *  base revision, the prompt and the attempt number, so re-sending the same
   *  request against the same state returns the original run instead of cutting
   *  a second revision — while a deliberate retry, which increments `attempt`,
   *  gets a key of its own. */
  idempotencyKey: string | null;
  /** The run this one retries, if any. History is append-only: a retry is a
   *  new run linked to the failed one, never an edit of it. */
  retryOfRunId: string | null;
  /** 1 for a first attempt, 2 for its first retry, and so on. Part of the
   *  idempotency key, which is what makes "retry once" and "double-clicked
   *  retry" distinguishable. */
  attempt: number;
  /** When a worker first claimed the run. Null while queued. */
  startedAt: Timestamp | null;
  /** Lease held by the worker currently advancing this run. A run whose lease
   *  has passed is abandoned — the process that claimed it died — and may be
   *  reclaimed. This is what makes the pipeline durable without a queue: any
   *  later request can pick up work a dead request left behind. */
  leaseExpiresAt: Timestamp | null;
  /** Structured failure. Kept beside `error` so the UI can show a message
   *  while the stage that produced it stays queryable. */
  failure: RunFailure | null;
  plan: BuildPlan | null;
  operations: readonly FileOperation[];
  report: ApplyReport | null;
  /** What the validator concluded, on success as well as failure.
   *
   * Previously only failures carried it, via `failure.validation` — which meant
   * warnings on an *applied* change were computed and then discarded. A change
   * that went in but links to a page nobody wrote is exactly the thing worth
   * telling someone about. */
  validation: ValidationResult | null;
  model: RunModelInfo | null;
  events: readonly GenerationEvent[];
  error: string | null;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
}

export interface CreateRunInput {
  projectId: ProjectId;
  prompt: string;
  baseRevisionId: RevisionId | null;
  generationId: GenerationId | null;
  mode: GenerationMode;
  idempotencyKey: string | null;
  /** The request that produced this run, kept so a worker can rebuild the
   *  inputs after the submitting request is gone. Durability means the run row
   *  has to be sufficient on its own. */
  intent: GenerationIntent;
  retryOfRunId?: string | null;
  attempt?: number;
}

/** A page of history.
 *
 * Keyset rather than offset: history is append-only and read newest-first, so
 * a cursor on `createdAt` is stable under concurrent writes in a way that
 * `OFFSET` is not — a run landing mid-scroll would otherwise shift every later
 * page by one.
 */
export interface RunQuery {
  projectId?: ProjectId;
  /** Restrict to these lifecycle states. Empty or absent means all. */
  statuses?: readonly GenerationStatus[];
  /** Only runs that produced this revision. */
  producedRevisionId?: RevisionId;
  /** Page size. Adapters clamp this — an unbounded page is a way to ask a
   *  database for everything. */
  limit?: number;
  /** `createdAt` of the last run on the previous page; returns older runs. */
  cursor?: Timestamp;
}

export interface RunPage {
  runs: readonly GenerationRun[];
  /** Pass back as `cursor` for the next page. Null when the list is exhausted. */
  nextCursor: Timestamp | null;
  hasMore: boolean;
}

export const DEFAULT_RUN_PAGE_SIZE = 10;
export const MAX_RUN_PAGE_SIZE = 50;

/** A run as history renders it.
 *
 * Every field the history view actually reads, and nothing else. The omission
 * that matters is `operations`: a run's operations carry the *full text of
 * every file it wrote*, so passing `GenerationRun` to a component means
 * shipping entire generated sites to the browser to render a row that shows a
 * count. Ten runs of a real project is megabytes of payload for a list nobody
 * expands.
 *
 * Projecting also narrows what a page can leak. History rows are the widest
 * read surface in the product; giving them a declared shape means adding a
 * field to `GenerationRun` cannot quietly put it on screen.
 */
export interface RunSummary {
  id: string;
  status: GenerationStatus;
  mode: GenerationMode;
  prompt: string;
  error: string | null;
  attempt: number;
  /** True when this run retries an earlier one. */
  isRetry: boolean;
  producedRevisionId: RevisionId | null;
  /** How many operations the run produced — the count, never the contents. */
  operationCount: number;
  applied: number | null;
  changedPaths: readonly string[];
  plan: {
    intent: PlanIntent | null;
    summary: string | null;
    steps: readonly { id: string; title: string }[];
  } | null;
  validation: ValidationResult | null;
  model: { providerId: string; modelId: string } | null;
  events: readonly { status: string; message: string }[];
  createdAt: Timestamp;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
}

/** Projects a run for display.
 *
 * Defensive throughout, because these fields are read back from a store that
 * holds them opaquely: a run written before `BuildPlan` grew `intent` really
 * does come back without one, and history that crashes on its own older rows
 * is worse than history that omits a label.
 */
export function toRunSummary(run: GenerationRun): RunSummary {
  return {
    id: run.id,
    status: run.status,
    mode: run.mode,
    prompt: run.prompt,
    error: run.error,
    attempt: run.attempt ?? 1,
    isRetry: Boolean(run.retryOfRunId),
    producedRevisionId: run.producedRevisionId,
    operationCount: run.operations?.length ?? 0,
    applied: run.report?.applied ?? null,
    changedPaths: run.report?.changedPaths ?? [],
    plan: run.plan
      ? {
          intent: run.plan.intent ?? null,
          summary: run.plan.summary ?? null,
          steps: (run.plan.steps ?? []).map((s, i) => ({
            id: s.id ?? `step-${i}`,
            title: s.title,
          })),
        }
      : null,
    // The run's own result first; the failure's copy is the fallback for rows
    // written before validation was recorded on success.
    validation: run.validation ?? run.failure?.validation ?? null,
    model: run.model
      ? { providerId: run.model.providerId, modelId: run.model.modelId }
      : null,
    events: (run.events ?? []).map((e) => ({ status: e.status, message: e.message })),
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}
