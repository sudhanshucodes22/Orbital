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
}

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
}
