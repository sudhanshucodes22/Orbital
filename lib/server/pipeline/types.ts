/** What a generation *executor* has to provide. SERVER ONLY.
 *
 * This is the seam that lets the deterministic template engine and the real
 * model share one lifecycle. Everything about a run — state, leases,
 * validation, revision cutting, failure recording — belongs to the pipeline.
 * A producer's only job is to turn a request into proposed operations.
 *
 * It deliberately cannot write files, cut revisions or touch run state. A
 * producer that could do those things would be a second pipeline.
 */
import type {
  ValidationResult,
  BuildPlan,
  FileOperation,
  GenerationMode,
  Project,
  ProjectContext,
  RunModelInfo,
} from "../../domain";

export interface ProducerContext {
  project: Project;
  /** The user's instruction, already extracted from the intent's inputs. */
  instruction: string;
  /** The retrieved window over the project. Built once by the pipeline and
   *  shared, so both producers are measured against the same input. */
  context: ProjectContext;
  /** Progress reporting. The pipeline persists these as run events. */
  report: (message: string) => void;
  /** Declares which stage the producer is in.
   *
   * Without this the pipeline can only say a producer threw, and every
   * failure — a planner that returned prose, a code generator that timed out —
   * is labelled "generation". The stage is the machine-readable half of a
   * failure, so collapsing them makes it useless for telling apart two
   * problems with very different causes. */
  stage: (stage: ProducerStage) => void;
  /** Hands the plan up as soon as there is one.
   *
   * The pipeline persists it immediately rather than waiting for the producer
   * to return. A run that fails during code generation would otherwise lose
   * the plan it had already made — which is exactly the run where knowing what
   * Orbital intended is most useful. */
  notePlan: (plan: BuildPlan) => void;
}

/** Stages a producer can be in. A subset of `FailureStage`: the ones a
 *  producer is actually responsible for. */
export type ProducerStage = "context" | "planning" | "generation";

export interface ProducedChange {
  operations: readonly FileOperation[];
  plan: BuildPlan;
  /** Null when no model was involved. The template producer sets it null and
   *  the run records that honestly. */
  model: RunModelInfo | null;
}

export interface OperationProducer {
  readonly mode: GenerationMode;
  produce(ctx: ProducerContext): Promise<ProducedChange>;
  /** A second attempt, told exactly what was wrong with the first.
   *
   * Optional: a producer that cannot use a diagnosis — the template engine
   * cannot, because it is keyword matching and would produce the same output
   * again — simply omits it, and the pipeline does not retry. Offering a
   * repair that is guaranteed to be identical would just burn a run.
   */
  repair?(ctx: RepairContext): Promise<ProducedChange>;
}

/** What a repair attempt is told.
 *
 * The rejected operations *and* the validator's reasons, because "your change
 * was rejected" is not actionable and "line 4 of index.html opens a <style>
 * that is never closed" is. */
export interface RepairContext extends ProducerContext {
  /** What the previous attempt proposed. */
  rejected: readonly FileOperation[];
  /** Why it was refused. */
  validation: ValidationResult;
  /** The plan the rejected operations were meant to carry out.
   *
   * Reused rather than replanned: the plan was not what failed, and
   * replanning would risk the repair drifting away from the request. */
  plan: BuildPlan;
  /** 1 for the first repair, 2 for the second. Bounded by the pipeline. */
  attempt: number;
}
