/** The worker and the active-run invariant.
 *
 * The property that matters: a queued run reaches a terminal state with nobody
 * polling it, and two simultaneous submissions cannot both become active.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { GenerationIntent, InputArtifact } from "../lib/domain";
import { asArtifactId } from "../lib/domain/ids";
import { ConflictError } from "../lib/errors";
import { __setContainer } from "../lib/server/container";
import { __setModelProvider } from "../lib/server/ai/registry";
import { createPipelineEngine, LEASE_MS } from "../lib/server/pipeline/pipeline";
import { templateProducer } from "../lib/server/pipeline/producers/template";
import { runWorkerTick } from "../lib/server/worker/worker";
import { fakeContainer, PROJECT_ID, type FakeState } from "./support/fake-container";

const NO_KICK = { autoStart: false };

function intent(text: string): GenerationIntent {
  const inputs: InputArtifact[] = [
    { id: asArtifactId("a1"), kind: "text", text, createdAt: new Date().toISOString() },
  ];
  return { type: "create", inputs };
}

describe("worker", () => {
  let state: FakeState;

  beforeEach(() => {
    const fake = fakeContainer();
    state = fake.state;
    __setContainer(fake.container);
    __setModelProvider(null);
  });

  it("claims a queued run and drives it to a revision with nobody polling", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("A coffee shop landing page."));
    assert.equal(state.runs[0].status, "queued");

    const result = await runWorkerTick();

    assert.equal(result.candidates, 1);
    assert.equal(result.claimed, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 0);
    assert.equal(state.runs[0].status, "succeeded");
    assert.equal(state.revisions.length, 1);
    assert.ok(state.files.length > 0);
  });

  it("does nothing when the queue is empty", async () => {
    const result = await runWorkerTick();
    assert.equal(result.candidates, 0);
    assert.equal(result.claimed, 0);
  });

  it("ignores runs a live worker already holds", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));

    // Someone else took the lease a moment ago.
    state.runs[0] = {
      ...state.runs[0],
      status: "running",
      leaseExpiresAt: new Date(Date.now() + LEASE_MS).toISOString(),
    };

    const result = await runWorkerTick();
    assert.equal(result.candidates, 0, "a live lease must not be offered as claimable");
    assert.equal(state.revisions.length, 0);
  });

  it("recovers a run abandoned by a dead worker", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));

    // The worker that held this run died: the lease is in the past.
    state.runs[0] = {
      ...state.runs[0],
      status: "running",
      startedAt: new Date(Date.now() - 10 * LEASE_MS).toISOString(),
      leaseExpiresAt: new Date(Date.now() - LEASE_MS).toISOString(),
    };

    const result = await runWorkerTick();
    assert.equal(result.candidates, 1, "an expired lease makes the run claimable again");
    assert.equal(result.succeeded, 1);
    assert.equal(state.runs[0].status, "succeeded");
    assert.equal(state.revisions.length, 1);
  });

  it("two concurrent workers do not both do the work", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));

    const [a, b] = await Promise.all([runWorkerTick(), runWorkerTick()]);

    // Exactly one did the work; the other saw the lease held.
    assert.equal(a.succeeded + b.succeeded, 1);
    assert.equal(state.revisions.length, 1, "a run must not produce two revisions");
    assert.equal(state.runs.length, 1);
  });

  it("carries on when one run in the batch fails", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    // Make the store reject writes so this run fails at persistence.
    state.failWrites = true;

    const result = await runWorkerTick();
    assert.equal(result.failed, 1);
    assert.equal(state.runs[0].status, "failed");
    assert.equal(state.revisions.length, 0, "a failed run must not cut a revision");
  });

  it("resumes a run under the executor it was queued with", async () => {
    // Queued as demo. The worker must not re-decide the mode from current
    // configuration — a run queued under one setup would otherwise finish
    // under another.
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("build it"));
    assert.equal(state.runs[0].mode, "demo");

    await runWorkerTick();
    assert.equal(state.runs[0].status, "succeeded");
    assert.equal(state.runs[0].model, null, "the template engine must not claim a model");
  });
});

describe("active-run invariant", () => {
  let state: FakeState;

  beforeEach(() => {
    const fake = fakeContainer();
    state = fake.state;
    __setContainer(fake.container);
    __setModelProvider(null);
  });

  it("refuses a second active run for the same project", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("first"));

    await assert.rejects(
      () => engine.submit(PROJECT_ID, intent("second, different request")),
      (e: unknown) => e instanceof ConflictError
    );
    assert.equal(state.runs.length, 1);
  });

  it("two simultaneous submissions cannot both become active", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);

    // Fired together, so the application-level findActive check in submit()
    // cannot be what saves us — both calls read the empty state before either
    // writes. The repository has to be the thing that refuses.
    const results = await Promise.allSettled([
      engine.submit(PROJECT_ID, intent("request A")),
      engine.submit(PROJECT_ID, intent("request B")),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "exactly one submission may win");
    assert.equal(rejected.length, 1);
    assert.ok(
      (rejected[0] as PromiseRejectedResult).reason instanceof ConflictError,
      "the loser must get a ConflictError, not a crash"
    );
    assert.equal(state.runs.length, 1, "only one run row may exist");
  });

  it("two identical simultaneous submissions collapse to one run", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);

    // Same prompt: idempotency, not conflict. Both callers should be handed
    // the same run rather than one of them being told the project is busy.
    const results = await Promise.allSettled([
      engine.submit(PROJECT_ID, intent("identical")),
      engine.submit(PROJECT_ID, intent("identical")),
    ]);

    assert.ok(
      results.every((r) => r.status === "fulfilled"),
      "a duplicate must not be reported as a conflict"
    );
    const ids = results.map((r) =>
      r.status === "fulfilled" ? r.value.id : null
    );
    assert.equal(ids[0], ids[1]);
    assert.equal(state.runs.length, 1);
  });

  it("allows a new run once the previous one is terminal", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("first"));
    await runWorkerTick();
    assert.equal(state.runs[0].status, "succeeded");

    const second = await engine.submit(PROJECT_ID, intent("second"));
    assert.equal(second.status, "queued");
    assert.equal(state.runs.length, 2);
  });

  it("does not let a stale run block the project forever", async () => {
    const engine = createPipelineEngine(templateProducer, NO_KICK);
    await engine.submit(PROJECT_ID, intent("abandoned"));
    state.runs[0] = {
      ...state.runs[0],
      status: "running",
      leaseExpiresAt: new Date(Date.now() - LEASE_MS).toISOString(),
    };

    // The stale run is not active, so a new request is admitted rather than
    // the project being stuck behind a worker that died.
    const next = await engine.submit(PROJECT_ID, intent("a fresh request"));
    assert.equal(next.status, "queued");
  });
});
