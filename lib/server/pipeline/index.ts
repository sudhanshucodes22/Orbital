/** The two generation engines, which are the same pipeline with different
 *  executors. SERVER ONLY. */
import { createPipelineEngine } from "./pipeline";
import { modelProducer } from "./producers/model";
import { templateProducer } from "./producers/template";

export const templateGeneration = createPipelineEngine(templateProducer);
export const modelGeneration = createPipelineEngine(modelProducer);

export { advance, idempotencyKeyFor, instructionFrom, LEASE_MS } from "./pipeline";
export type { OperationProducer, ProducedChange, ProducerContext } from "./types";
