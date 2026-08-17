/** The model-backed producer. SERVER ONLY.
 *
 * What used to be the whole of `lib/server/ai/engine.ts` is now just this: two
 * model calls that return proposed operations. Run state, leases, validation,
 * application, revisions and failure recording all moved to the pipeline,
 * which the template producer shares.
 */
import type { OperationProducer, ProducedChange, ProducerContext } from "../types";
import { generate, plan } from "../../ai/planner";
import { getModelProvider, hasModelProvider } from "../../ai/registry";
import { CAPABILITY_REQUIREMENTS } from "../../../config/env";
import { NotConfiguredError } from "../../../errors";

export const modelProducer: OperationProducer = {
  mode: "model",

  async produce(ctx: ProducerContext): Promise<ProducedChange> {
    if (!hasModelProvider()) {
      // Never a silent fall back to the template producer: a configured-but-
      // broken provider must fail visibly, and an unconfigured one must say so.
      throw new NotConfiguredError("generation", CAPABILITY_REQUIREMENTS.generation);
    }

    const provider = getModelProvider();

    // Declared so a throw from the planner is recorded as a planning failure
    // rather than being flattened into "generation" — two very different
    // problems with two different fixes.
    ctx.stage("planning");
    ctx.report("planning the change");
    const planned = await plan(provider, {
      projectName: ctx.project.name,
      projectDescription: ctx.project.description,
      instruction: ctx.instruction,
      context: ctx.context,
    });

    // The plan exists now, so the pipeline gets it now. If code generation
    // fails after this, the run still shows what Orbital intended to do.
    ctx.notePlan(planned.plan);
    ctx.stage("generation");
    ctx.report(planned.plan.summary);
    ctx.report(`writing ${planned.plan.steps.length} step(s)`);

    const generated = await generate(provider, {
      projectName: ctx.project.name,
      instruction: ctx.instruction,
      plan: planned.plan,
      context: ctx.context,
    });

    return {
      operations: generated.operations,
      plan: planned.plan,
      // Usage from the generation call: it is the larger of the two and the
      // one worth attributing the run's cost to.
      model: {
        providerId: generated.providerId,
        modelId: generated.modelId,
        inputTokens: generated.usage.inputTokens,
        outputTokens: generated.usage.outputTokens,
      },
    };
  },
};
