/** The durable generation pipeline.
 *
 * Covers the milestone's claims: a run reaches a terminal state, failures are
 * persisted, no invalid output ever becomes a revision, a resubmission rejoins
 * its original run, and a second concurrent generation is refused.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { GenerationIntent, InputArtifact } from "../lib/domain";
import { asArtifactId } from "../lib/domain/ids";
import { ConflictError, isNotConfigured } from "../lib/errors";
import { __setContainer } from "../lib/server/container";
import { __setModelProvider } from "../lib/server/ai/registry";
import { advance, createPipelineEngine } from "../lib/server/pipeline/pipeline";
import { templateProducer } from "../lib/server/pipeline/producers/template";
import { modelProducer } from "../lib/server/pipeline/producers/model";
import type { OperationProducer } from "../lib/server/pipeline/types";
import { fakeContainer, PROJECT_ID, type FakeState } from "./support/fake-container";

function intent(text: string): GenerationIntent {
  const inputs: InputArtifact[] = [
    { id: asArtifactId("a1"), kind: "text", text, createdAt: new Date().toISOString() },
  ];
  return { type: "create", inputs };
}

/** A producer scripted for the test, standing in for either executor. */
function producerReturning(operations: unknown[], mode: "demo" | "model" = "model"): OperationProducer {
  return {
    mode,
    async produce() {
      return {
        operations: operations as never,
        plan: {
          intent: "create" as const,
          summary: "Build it.",
          steps: [
            { id: "s1", title: "write", action: "create" as const, targets: ["index.html"], rationale: null },
          ],
          isInitialBuild: true,
          dependencies: [],
          configChanges: [],
          validation: [],
          notes: null,
        },
        model: mode === "model"
          ? { providerId: "custom", modelId: "mock-1", inputTokens: 10, outputTokens: 20 }
          : null,
      };
    },
  };
}

function producerThrowing(error: Error): OperationProducer {
  return {
    mode: "model",
    async produce(): Promise<never> {
      throw error;
    },
  };
}

/** Tests drive `advance` explicitly, so the submit-time kick is disabled —
 *  otherwise the kick and the test race for the same lease. */
const NO_KICK = { autoStart: false };

const GOOD_OPS = [{ kind: "createFile", path: "index.html", content: "<title>Beans</title>" }];

describe("durable pipeline — happy path", () => {
  let state: FakeState;

  beforeEach(() => {
    const fake = fakeContainer();
    state = fake.state;
    __setContainer(fake.container);
    __setModelProvider(null);
  });

  it("submits as queued, leaving the work for a worker", async () => {
    const engine = createPipelineEngine(producerReturning(GOOD_OPS), NO_KICK);
    const job = await engine.submit(PROJECT_ID, intent("build it"));

    // The run exists and is durable before any work has happened — that is
    // what lets a later request finish it.
    assert.equal(job.status, "queued");
    assert.equal(state.runs.length, 1);
    assert.equal(state.runs[0].status, "queued");
    assert.equal(state.revisions.length, 0);
  });

  it("a poll picks up work the submitting request never started", async () => {
    const engine = createPipelineEngine(producerReturning(GOOD_OPS), NO_KICK);
    const job = await engine.submit(PROJECT_ID, intent("build it"));

    // Simulates the submitting request dying: nothing ran, the row is queued.
    const polled = await engine.get(job.id);
    assert.equal(polled?.status, "succeeded");
    assert.equal(state.revisions.length, 1);
  });

  it("runs to succeeded, writes files and cuts a revision", async () => {
    const engine = createPipelineEngine(producerReturning(GOOD_OPS), NO_KICK);
    const job = await engine.submit(PROJECT_ID, intent("build it"));

    const run = await advance(state.runs[0].id, producerReturning(GOOD_OPS));
    assert.equal(run.status, "succeeded");
    assert.ok(job.id);

    assert.deepEqual(state.files.map((f) => f.path), ["index.html"]);
    assert.equal(state.revisions.length, 1);
    assert.equal(state.revisions[0].tree?.length, 1);
    assert.equal(state.project.status, "ready");
    assert.equal(state.project.currentRevisionId, state.revisions[0].id);

    assert.equal(run.producedRevisionId, state.revisions[0].id);
    assert.equal(run.report?.applied, 1);
    assert.ok(run.startedAt, "startedAt should be recorded");
    assert.ok(run.completedAt, "completedAt should be recorded");
    assert.equal(run.leaseExpiresAt, null, "lease should be released");
  });

  it("derives the site view from the frozen tree, including the page title", async () => {
    const engine = createPipelineEngine(producerReturning(GOOD_OPS), NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    await advance(state.runs[0].id, producerReturning(GOOD_OPS));

    const site = state.revisions[0].site;
    assert.equal(site.pages.length, 1);
    assert.equal(site.pages[0].path, "/");
    assert.equal(site.pages[0].title, "Beans");
  });

  it("passes through the state machine", async () => {
    const engine = createPipelineEngine(producerReturning(GOOD_OPS), NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    const run = await advance(state.runs[0].id, producerReturning(GOOD_OPS));

    const seen = run.events.map((e) => e.status);
    assert.ok(seen.includes("reading"));
    assert.ok(seen.includes("validating"), "a validating event must be recorded");
    assert.ok(seen.includes("succeeded"));
  });
});

describe("durable pipeline — failures", () => {
  let state: FakeState;

  beforeEach(() => {
    const fake = fakeContainer();
    state = fake.state;
    __setContainer(fake.container);
    __setModelProvider(null);
  });

  const expectFailed = (stage: string) => {
    const run = state.runs[0];
    assert.equal(run.status, "failed");
    assert.equal(run.failure?.stage, stage);
    assert.equal(state.revisions.length, 0, "no revision may be created on failure");
    return run;
  };

  it("records a provider failure and creates no revision", async () => {
    const p = producerThrowing(new Error("upstream exploded"));
    const engine = createPipelineEngine(p, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    await advance(state.runs[0].id, p);

    const run = expectFailed("generation");
    assert.match(run.error ?? "", /upstream exploded/);
    assert.equal(state.files.length, 0);
  });

  it("records a configuration failure distinctly from a generation failure", async () => {
    const engine = createPipelineEngine(modelProducer, NO_KICK);
    __setModelProvider(null); // nothing configured
    await engine.submit(PROJECT_ID, intent("build it"));
    await advance(state.runs[0].id, modelProducer);

    const run = expectFailed("configuration");
    assert.ok(isNotConfigured(new Error()) === false); // sanity: helper is a type guard
    assert.match(run.error ?? "", /GENERATION_API_KEY/);
  });

  it("fails validation on an unsafe path, before anything is written", async () => {
    const ops = [{ kind: "createFile", path: "../../etc/passwd", content: "pwned" }];
    const p = producerReturning(ops);
    const engine = createPipelineEngine(p, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    await advance(state.runs[0].id, p);

    const run = expectFailed("validation");
    assert.equal(state.files.length, 0);
    assert.equal(run.failure?.validation?.valid, false);
    assert.equal(run.failure?.validation?.errors[0].code, "unsafePath");
  });

  it("fails validation on conflicting operations", async () => {
    const ops = [
      { kind: "createFile", path: "index.html", content: "a" },
      { kind: "createFile", path: "index.html", content: "b" },
    ];
    const p = producerReturning(ops);
    const engine = createPipelineEngine(p, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    await advance(state.runs[0].id, p);

    const run = expectFailed("validation");
    assert.ok(
      run.failure?.validation?.errors.some((e) => e.code === "conflictingOperations"),
      "expected a conflict error"
    );
  });

  it("records a persistence failure when the store rejects the write", async () => {
    const p = producerReturning(GOOD_OPS);
    const engine = createPipelineEngine(p, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    state.failWrites = true;
    await advance(state.runs[0].id, p);

    const run = expectFailed("persistence");
    assert.match(run.error ?? "", /disk on fire/);
  });

  it("leaves a failed run failed when polled again", async () => {
    const p = producerThrowing(new Error("nope"));
    const engine = createPipelineEngine(p, NO_KICK);
    const job = await engine.submit(PROJECT_ID, intent("build it"));
    await advance(state.runs[0].id, p);

    const polled = await engine.get(job.id);
    assert.equal(polled?.status, "failed");
    assert.equal(state.revisions.length, 0);
    assert.equal(state.runs.length, 1, "polling must not start a second run");
  });
});

describe("idempotency and concurrency", () => {
  let state: FakeState;

  beforeEach(() => {
    const fake = fakeContainer();
    state = fake.state;
    __setContainer(fake.container);
    __setModelProvider(null);
  });

  it("returns the original run when the same request is submitted twice", async () => {
    const p = producerReturning(GOOD_OPS);
    const engine = createPipelineEngine(p, NO_KICK);

    const first = await engine.submit(PROJECT_ID, intent("build it"));
    const second = await engine.submit(PROJECT_ID, intent("build it"));

    assert.equal(first.id, second.id);
    assert.equal(state.runs.length, 1, "a duplicate submit must not create a second run");
  });

  it("does not cut two revisions for a duplicated request", async () => {
    const p = producerReturning(GOOD_OPS);
    const engine = createPipelineEngine(p, NO_KICK);

    await engine.submit(PROJECT_ID, intent("build it"));
    await advance(state.runs[0].id, p);
    await engine.submit(PROJECT_ID, intent("build it"));

    assert.equal(state.revisions.length, 1);
  });

  it("refuses a second generation while one is active", async () => {
    const stalled = { mode: "model", produce: () => new Promise(() => {}) } as OperationProducer;
    const engine = createPipelineEngine(stalled, NO_KICK);

    await engine.submit(PROJECT_ID, intent("first request"));
    await assert.rejects(
      () => engine.submit(PROJECT_ID, intent("a different second request")),
      (e: unknown) => e instanceof ConflictError && /already has a generation/.test((e as Error).message)
    );
    assert.equal(state.runs.length, 1);
  });

  it("only one of two concurrent workers does the work", async () => {
    const p = producerReturning(GOOD_OPS);
    const engine = createPipelineEngine(p, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    const runId = state.runs[0].id;

    await Promise.all([advance(runId, p), advance(runId, p)]);

    assert.equal(state.revisions.length, 1, "a run must not produce two revisions");
    assert.equal(state.files.filter((f) => f.path === "index.html").length, 1);
  });

  it("lets a new generation start once the previous one is terminal", async () => {
    const p = producerReturning(GOOD_OPS);
    const engine = createPipelineEngine(p, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    await advance(state.runs[0].id, p);

    // Different prompt and a new current revision, so a different key.
    const second = await engine.submit(PROJECT_ID, intent("now change the header"));
    assert.equal(second.status, "queued");
    assert.equal(state.runs.length, 2);
  });
});

describe("demo generation runs the same pipeline", () => {
  let state: FakeState;

  beforeEach(() => {
    const fake = fakeContainer();
    state = fake.state;
    __setContainer(fake.container);
    __setModelProvider(null);
  });

  it("produces a revision through run → validation → revision, recording mode demo", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("A coffee shop landing page."));
    const run = await advance(state.runs[0].id, templateProducer);

    assert.equal(run.status, "succeeded");
    assert.equal(run.mode, "demo");
    assert.equal(run.model, null, "the template engine must not claim a model");

    // Same lifecycle artefacts as the model path.
    assert.ok(run.plan, "the template producer still yields a plan");
    assert.equal(run.report?.rejected, 0);
    assert.equal(state.revisions.length, 1);
    assert.ok(state.revisions[0].tree && state.revisions[0].tree.length >= 4);
    assert.equal(state.project.status, "ready");

    const paths = state.files.map((f) => f.path).sort();
    assert.deepEqual(paths, ["contact.html", "design-tokens.json", "index.html", "pricing.html"]);
  });

  it("emits a validating event like every other run", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    const run = await advance(state.runs[0].id, templateProducer);
    assert.ok(run.events.some((e) => e.status === "validating"));
  });
});
