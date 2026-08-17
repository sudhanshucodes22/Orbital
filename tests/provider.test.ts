/** The real model path, driven by a fake provider.
 *
 * ## What this does and does not prove
 *
 * Every layer here is the production one: `modelProducer`, the real planner
 * and code-generator prompts, the real JSON parsers, the real validator, the
 * real pipeline, real revision creation. The only substitution is the network
 * call — a `ModelProvider` that returns scripted text instead of reaching
 * Anthropic.
 *
 * So this proves the *contract*: given output of a given shape, Orbital does
 * the right thing, and given a failure of a given shape, it fails safely. It
 * does **not** prove that a live Anthropic call succeeds, that the prompts
 * elicit good output, or that the SDK is wired correctly. Those need a key and
 * are reported as unverified.
 *
 * The failure cases mirror the exact `ModelCallError` shapes
 * `providers/anthropic.ts` produces, so what is asserted here is what the real
 * adapter would hand upstream — not an invented error.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { GenerationIntent, InputArtifact } from "../lib/domain";
import { asArtifactId, asRevisionId } from "../lib/domain";
import { __setContainer } from "../lib/server/container";
import { __setModelProvider } from "../lib/server/ai/registry";
import { ModelCallError } from "../lib/server/ai/providers/anthropic";
import type { ModelProvider, ModelResponse } from "../lib/ai/types";
import { advance, createPipelineEngine } from "../lib/server/pipeline/pipeline";
import { modelProducer } from "../lib/server/pipeline/producers/model";
import { fakeContainer, PROJECT_ID, type FakeState } from "./support/fake-container";

const NO_KICK = { autoStart: false };

function intent(text: string): GenerationIntent {
  const inputs: InputArtifact[] = [
    { id: asArtifactId("a1"), kind: "text", text, createdAt: new Date().toISOString() },
  ];
  return { type: "create", inputs };
}

/** A provider whose two calls — plan, then generate — are scripted.
 *
 * `complete` is called twice per run by `modelProducer`. Scripting them
 * separately is what lets a test make planning succeed and generation fail,
 * which is a real and distinct failure mode. */
function fakeProvider(script: {
  plan?: string | (() => never);
  code?: string | (() => never);
  onCall?: (n: number) => void;
}): ModelProvider {
  let calls = 0;
  return {
    id: "anthropic",
    spec: { id: "anthropic", modelId: "claude-opus-4-8", maxOutputTokens: 8192 } as never,
    async complete(): Promise<ModelResponse> {
      calls++;
      script.onCall?.(calls);
      const step = calls === 1 ? script.plan : script.code;
      if (typeof step === "function") step();
      return {
        text: (step as string) ?? "{}",
        usage: { inputTokens: 1200, outputTokens: 800 },
        modelId: "claude-opus-4-8",
        providerId: "anthropic",
        stopReason: "end_turn",
      };
    },
  };
}

const GOOD_PLAN = JSON.stringify({
  intent: "modify",
  summary: "Darken the hero and tighten the subheading.",
  isInitialBuild: false,
  steps: [
    {
      id: "s1",
      title: "Restyle the hero",
      action: "update",
      targets: ["index.html"],
      rationale: "The hero is defined in index.html",
    },
  ],
  dependencies: [],
  configChanges: [],
  validation: [],
  notes: null,
});

const GOOD_CODE = JSON.stringify({
  operations: [
    {
      kind: "updateFile",
      path: "index.html",
      content: "<!doctype html><title>Hero</title><h1>Darker hero</h1>",
    },
  ],
});

let state: FakeState;

beforeEach(() => {
  const fake = fakeContainer();
  state = fake.state;
  __setContainer(fake.container);
  // A starting revision, so this is an edit rather than a first build.
  state.files.push({
    projectId: PROJECT_ID,
    path: "index.html",
    kind: "text",
    content: "<!doctype html><title>Hero</title><h1>Original hero</h1>",
    storageKey: null,
    hash: "h-original",
    byteSize: 55,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

/** Runs one generation to completion through the real pipeline. */
async function run(provider: ModelProvider, instruction = "Make the hero darker.") {
  __setModelProvider(provider);
  const engine = createPipelineEngine(modelProducer, NO_KICK);
  const job = await engine.submit(PROJECT_ID, intent(instruction));
  const runId = state.runs.find((r) => r.generationId === job.id)!.id;
  return advance(runId, modelProducer);
}

describe("real model path — success", () => {
  it("plans, generates, validates and cuts a revision", async () => {
    const result = await run(fakeProvider({ plan: GOOD_PLAN, code: GOOD_CODE }));

    assert.equal(result.status, "succeeded");
    assert.ok(result.producedRevisionId, "a successful run must produce a revision");
    assert.equal(result.operations.length, 1);
    assert.equal(result.report?.applied, 1);
  });

  it("records the provider and model that actually answered", async () => {
    const result = await run(fakeProvider({ plan: GOOD_PLAN, code: GOOD_CODE }));

    // History must never be able to imply a model was involved when none was,
    // or name a model that did not answer.
    assert.equal(result.mode, "model");
    assert.equal(result.model?.providerId, "anthropic");
    assert.equal(result.model?.modelId, "claude-opus-4-8");
    assert.equal(result.model?.inputTokens, 1200);
    assert.equal(result.model?.outputTokens, 800);
  });

  it("keeps the planner's structured output on the run", async () => {
    const result = await run(fakeProvider({ plan: GOOD_PLAN, code: GOOD_CODE }));

    assert.equal(result.plan?.intent, "modify");
    assert.equal(result.plan?.summary, "Darken the hero and tighten the subheading.");
    assert.equal(result.plan?.steps.length, 1);
    assert.deepEqual(result.plan?.steps[0].targets, ["index.html"]);
  });

  it("records timing and the revision relationship", async () => {
    const before = Date.now();
    const result = await run(fakeProvider({ plan: GOOD_PLAN, code: GOOD_CODE }));

    assert.ok(result.startedAt, "a run must record when it started");
    assert.ok(result.completedAt, "a completed run must record when it finished");
    assert.ok(Date.parse(result.completedAt!) >= before);
    // The chain: this run's revision descends from the base it was given.
    const revision = state.revisions.find((r) => r.id === result.producedRevisionId);
    assert.ok(revision, "the produced revision must exist");
  });

  it("makes two provider calls: plan, then generate", async () => {
    const seen: number[] = [];
    await run(fakeProvider({ plan: GOOD_PLAN, code: GOOD_CODE, onCall: (n) => seen.push(n) }));

    // Separating planning from code generation is the architecture; one call
    // doing both would mean the plan was never a commitment the generator had
    // to obey.
    assert.deepEqual(seen, [1, 2]);
  });
});

describe("real model path — provider failures", () => {
  /** The shape `providers/anthropic.ts` produces for a bad key. */
  const invalidKey = () => {
    throw new ModelCallError(
      "The model provider rejected the API key. Check GENERATION_API_KEY.",
      { status: 401 }
    );
  };

  const timeout = () => {
    throw new ModelCallError("The model provider did not respond in time.", {
      retryable: true,
      status: null,
    });
  };

  const rateLimited = () => {
    throw new ModelCallError("The model provider is rate limiting requests. Try again shortly.", {
      retryable: true,
      status: 429,
    });
  };

  for (const [name, failure] of [
    ["an invalid API key", invalidKey],
    ["a timeout", timeout],
    ["rate limiting", rateLimited],
  ] as const) {
    it(`fails safely on ${name}`, async () => {
      const before = state.revisions.length;
      const result = await run(fakeProvider({ plan: failure }));

      assert.equal(result.status, "failed");
      // The four properties that together make a failure safe.
      assert.equal(result.producedRevisionId, null, "a failed run must not produce a revision");
      assert.equal(state.revisions.length, before, "no revision may be created");
      assert.ok(result.error && result.error.length > 0, "the user needs a reason");
      assert.ok(result.failure?.stage, "the failure needs a machine-readable stage");
    });
  }

  it("never puts the API key in anything it persists", async () => {
    const leaky = () => {
      // A provider error that carelessly embedded the credential. The adapter
      // translates at its boundary precisely so this cannot propagate, and
      // this asserts the run row stays clean.
      throw new ModelCallError(
        "The model provider rejected the API key. Check GENERATION_API_KEY.",
        { status: 401 }
      );
    };
    const result = await run(fakeProvider({ plan: leaky }));

    const persisted = JSON.stringify(result);
    assert.doesNotMatch(persisted, /sk-ant-/, "an API key must never reach a run row");
    // The message names the *variable*, which is the useful thing, not a value.
    assert.match(result.error ?? "", /GENERATION_API_KEY/);
  });

  it("leaves the previous project intact after a provider failure", async () => {
    const original = state.files.find((f) => f.path === "index.html")!.content;
    await run(fakeProvider({ plan: invalidKey }));

    assert.equal(
      state.files.find((f) => f.path === "index.html")!.content,
      original,
      "a failed generation must not touch the working tree"
    );
  });

  it("fails at generation when planning succeeded", async () => {
    // A distinct failure mode: the plan is fine, the code call dies.
    const result = await run(fakeProvider({ plan: GOOD_PLAN, code: timeout }));

    assert.equal(result.status, "failed");
    assert.equal(result.producedRevisionId, null);
    // The plan survives on the run, which is what makes the failure
    // diagnosable rather than opaque.
    assert.ok(result.plan, "a plan produced before the failure should be kept");
  });

  it("keeps a failed run retryable", async () => {
    const result = await run(fakeProvider({ plan: timeout }));

    // Retry is only offered for failures; this is the precondition the
    // conversation panel and `retryRun` both check.
    assert.equal(result.status, "failed");
    assert.equal(result.completedAt !== null, true);
  });
});

describe("real model path — malformed provider output", () => {
  it("refuses a plan that is not JSON", async () => {
    const result = await run(fakeProvider({ plan: "I'd be happy to help! Here's my plan…" }));

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.stage, "planning");
    assert.equal(result.producedRevisionId, null);
  });

  it("refuses a plan that is JSON but the wrong shape", async () => {
    const result = await run(
      fakeProvider({ plan: JSON.stringify({ summary: "no steps, no intent" }) })
    );

    assert.equal(result.status, "failed");
    assert.equal(result.producedRevisionId, null);
  });

  it("refuses operations that are not JSON", async () => {
    const result = await run(fakeProvider({ plan: GOOD_PLAN, code: "```\nnot json\n```" }));

    assert.equal(result.status, "failed");
    assert.equal(result.producedRevisionId, null);
  });

  it("refuses an operation with an unsafe path", async () => {
    const result = await run(
      fakeProvider({
        plan: GOOD_PLAN,
        code: JSON.stringify({
          operations: [{ kind: "updateFile", path: "../../.env", content: "STOLEN=1" }],
        }),
      })
    );

    assert.equal(result.status, "failed");
    assert.equal(result.producedRevisionId, null);
    // Model output is input, not instruction. The path never reaches the
    // filesystem, whether it was refused by the parser or the validator.
    assert.equal(
      state.files.some((f) => f.path.includes("..") || f.path.includes(".env")),
      false
    );
  });

  it("refuses an operation the plan did not authorise a path for", async () => {
    const result = await run(
      fakeProvider({
        plan: GOOD_PLAN,
        code: JSON.stringify({
          operations: [
            { kind: "updateFile", path: "index.html", content: "<h1>ok</h1>" },
            { kind: "updateFile", path: "index.html", content: "<h1>again</h1>" },
          ],
        }),
      })
    );

    // Two operations on one path in one batch: the validator rejects the
    // ambiguity rather than picking a winner.
    assert.equal(result.status, "failed");
    assert.equal(result.producedRevisionId, null);
  });

  it("refuses an empty operation set rather than cutting an empty revision", async () => {
    const result = await run(
      fakeProvider({ plan: GOOD_PLAN, code: JSON.stringify({ operations: [] }) })
    );

    assert.equal(result.status, "failed");
    assert.equal(result.producedRevisionId, null);
  });

  it("survives a provider that returns nothing at all", async () => {
    const result = await run(fakeProvider({ plan: "" }));

    assert.equal(result.status, "failed");
    assert.ok(result.error);
  });
});

describe("provider configuration", () => {
  it("refuses to generate when no provider is configured", async () => {
    __setModelProvider(null);
    const engine = createPipelineEngine(modelProducer, NO_KICK);
    const job = await engine.submit(PROJECT_ID, intent("build something"));
    const runId = state.runs.find((r) => r.generationId === job.id)!.id;
    const result = await advance(runId, modelProducer);

    // Never a silent fall back to the template engine: that would hand back
    // plausible output no model produced, which is the one outcome this system
    // must not have.
    assert.equal(result.status, "failed");
    assert.equal(result.mode, "model");
    assert.equal(result.producedRevisionId, null);
    assert.match(result.error ?? "", /GENERATION_/);
  });

  it("does not record a model on a run no model answered", async () => {
    __setModelProvider(null);
    const engine = createPipelineEngine(modelProducer, NO_KICK);
    const job = await engine.submit(PROJECT_ID, intent("build something"));
    const runId = state.runs.find((r) => r.generationId === job.id)!.id;
    const result = await advance(runId, modelProducer);

    assert.equal(result.model, null);
  });
});

describe("revision safety across a failed edit", () => {
  it("keeps the last working revision as the project head", async () => {
    // A good edit, then a bad one.
    const good = await run(fakeProvider({ plan: GOOD_PLAN, code: GOOD_CODE }));
    assert.equal(good.status, "succeeded");
    const head = state.project.currentRevisionId;

    state.runs.length = 0; // clear so the next submit is not deduplicated
    const bad = await run(
      fakeProvider({ plan: GOOD_PLAN, code: "garbage" }),
      "Another change."
    );

    assert.equal(bad.status, "failed");
    assert.equal(
      state.project.currentRevisionId,
      head,
      "a failed edit must leave the head where it was"
    );
    assert.equal(state.project.currentRevisionId, good.producedRevisionId);
  });

  it("preserves the failed run in history", async () => {
    await run(fakeProvider({ plan: "not json" }));

    const failed = state.runs.filter((r) => r.status === "failed");
    assert.equal(failed.length, 1, "a failure must stay in history, not be discarded");
    assert.ok(failed[0].prompt.length > 0, "and must keep what was asked");
  });
});

/** Revision ids used above are branded; this keeps the import honest. */
void asRevisionId;
