/** The planner and the code generator.
 *
 * Two separate model calls with two separate jobs:
 *
 *   plan(...)     "what should change?"  → BuildPlan
 *   generate(...) "what are the bytes?"  → FileOperation[]
 *
 * Kept apart because they fail differently and are reviewed differently. A
 * plan is small, cheap and legible — it is the artefact a human or a validator
 * can reject before anything is written. Folding the two together would mean
 * the first inspectable output is also the one that already contains the file
 * contents, which removes the point of having a plan at all.
 *
 * Both take a `ModelProvider` as an argument rather than resolving one. That
 * is what makes them testable against a mock with no network, no credentials
 * and no container.
 */
import type { BuildPlan, FileOperation, ProjectContext } from "../../domain";
import { renderContext } from "../../services/context";
import { parseOperations, parsePlan, extractJson } from "../../ai/parse";
import { OPERATIONS_SCHEMA, PLAN_SCHEMA } from "../../ai/schema";
import type { ModelProvider, ModelUsage, ModelResponse } from "../../ai/types";
import { textMessage } from "../../ai/types";
import { ValidationError } from "../../errors";
import { CODEGEN_SYSTEM, PLANNER_SYSTEM, codegenPrompt, plannerPrompt, repairPrompt } from "./prompts";

/** A plan is a small document; a generated project is not. Separate ceilings
 *  so a planning call cannot be billed as if it were a build. */
const PLAN_MAX_TOKENS = 8_000;
const CODEGEN_MAX_TOKENS = 32_000;

export interface PlanOutcome {
  plan: BuildPlan;
  usage: ModelUsage;
  modelId: string;
  providerId: string;
}

export interface GenerateOutcome {
  operations: FileOperation[];
  usage: ModelUsage;
  modelId: string;
  providerId: string;
}

export interface PlannerInput {
  projectName: string;
  projectDescription: string | null;
  instruction: string;
  context: ProjectContext;
}

export async function plan(
  provider: ModelProvider,
  input: PlannerInput
): Promise<PlanOutcome> {
  const rendered = renderContext(input.context);

  const response = await provider.complete({
    system: PLANNER_SYSTEM,
    messages: [
      textMessage(
        "user",
        plannerPrompt({
          projectName: input.projectName,
          projectDescription: input.projectDescription,
          instruction: input.instruction,
          context: rendered,
          hasFiles: input.context.map.totalFiles > 0,
        })
      ),
    ],
    maxOutputTokens: PLAN_MAX_TOKENS,
    jsonSchema: PLAN_SCHEMA,
  });

  const json = extractJson(response.text);
  if (!json.ok) throw new ValidationError(`The planner returned unusable output: ${json.error}`);

  const parsed = parsePlan(json.value);
  if (!parsed.ok) {
    throw new ValidationError(`The planner returned an invalid plan: ${parsed.error}`);
  }

  return {
    plan: parsed.value,
    usage: response.usage,
    modelId: response.modelId,
    providerId: response.providerId,
  };
}

export interface GenerateInput {
  projectName: string;
  instruction: string;
  plan: BuildPlan;
  context: ProjectContext;
}

/** A second attempt at code generation, given the validator's complaints.
 *
 * Reuses the code-generator system prompt and parser, because a repair is a
 * generation with more information — not a different kind of call. A separate
 * schema or parser here would be a second thing to keep in step with the
 * first. */
export async function repair(
  provider: ModelProvider,
  input: GenerateInput & { rejected: readonly unknown[]; problems: readonly string[]; attempt: number }
): Promise<GenerateOutcome> {
  const rendered = renderContext(input.context);

  const response = await provider.complete({
    system: CODEGEN_SYSTEM,
    messages: [
      textMessage(
        "user",
        repairPrompt({
          instruction: input.instruction,
          planJson: JSON.stringify(input.plan, null, 2),
          rejectedJson: JSON.stringify(input.rejected, null, 2),
          problems: input.problems,
          attempt: input.attempt,
          context: rendered,
        })
      ),
    ],
    maxOutputTokens: CODEGEN_MAX_TOKENS,
    jsonSchema: OPERATIONS_SCHEMA,
  });

  return finishGeneration(response);
}

export async function generate(
  provider: ModelProvider,
  input: GenerateInput
): Promise<GenerateOutcome> {
  const rendered = renderContext(input.context);

  const response = await provider.complete({
    system: CODEGEN_SYSTEM,
    messages: [
      textMessage(
        "user",
        codegenPrompt({
          projectName: input.projectName,
          instruction: input.instruction,
          // The plan goes back as JSON rather than prose so the generator sees
          // the same structure the planner committed to, field for field.
          planJson: JSON.stringify(input.plan, null, 2),
          context: rendered,
        })
      ),
    ],
    maxOutputTokens: CODEGEN_MAX_TOKENS,
    jsonSchema: OPERATIONS_SCHEMA,
  });

  return finishGeneration(response);
}

/** Parses and validates a code-generation response.
 *
 * Shared by `generate` and `repair` so the two cannot drift: a repair that
 * accepted output the first pass would have rejected is a hole in the
 * validator, not a feature. */
function finishGeneration(response: ModelResponse): GenerateOutcome {
  const json = extractJson(response.text);
  if (!json.ok) {
    throw new ValidationError(`The code generator returned unusable output: ${json.error}`);
  }

  const parsed = parseOperations(json.value);
  if (!parsed.ok) {
    throw new ValidationError(`The code generator returned invalid operations: ${parsed.error}`);
  }
  if (parsed.value.length === 0) {
    throw new ValidationError("The code generator returned no changes.");
  }

  return {
    operations: parsed.value,
    usage: response.usage,
    modelId: response.modelId,
    providerId: response.providerId,
  };
}
