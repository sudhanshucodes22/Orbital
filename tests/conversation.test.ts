/** Run history as a conversation.
 *
 * The property that matters: the conversation is a *view* of runs, so it can
 * never say something history does not. These tests pin the mapping from every
 * run state to what the panel shows — including that a pending run never
 * claims a result, and a failure always offers a way forward.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conversationFrom, isPending } from "../lib/domain/conversation";
import type { GenerationStatus } from "../lib/domain/generation";
import type { RunSummary } from "../lib/domain/run";
import { asRevisionId } from "../lib/domain/ids";

function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    status: "succeeded",
    mode: "model",
    prompt: "Make the hero section more premium.",
    error: null,
    attempt: 1,
    isRetry: false,
    producedRevisionId: asRevisionId("rev-1"),
    operationCount: 3,
    applied: 2,
    changedPaths: ["index.html", "styles.css"],
    plan: { intent: "restyle", summary: "Rework the hero.", steps: [] },
    validation: null,
    model: { providerId: "anthropic", modelId: "claude-opus-4-8" },
    events: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    completedAt: "2026-01-01T00:00:09.000Z",
    ...over,
  };
}

describe("conversationFrom", () => {
  it("reads oldest first, unlike every other history view", () => {
    const turns = conversationFrom([
      run({ id: "b", createdAt: "2026-01-02T00:00:00.000Z", prompt: "second" }),
      run({ id: "a", createdAt: "2026-01-01T00:00:00.000Z", prompt: "first" }),
    ]);
    assert.deepEqual(
      turns.map((t) => t.prompt),
      ["first", "second"]
    );
  });

  it("keeps the user's instruction verbatim", () => {
    const turns = conversationFrom([run({ prompt: "  Keep   my  spacing.  " })]);
    assert.equal(turns[0].prompt, "  Keep   my  spacing.  ");
  });

  it("reports a success with what actually changed", () => {
    const [turn] = conversationFrom([run()]);
    assert.equal(turn.reply.kind, "success");
    assert.equal(turn.reply.headline, "Changes applied");
    assert.equal(turn.reply.filesChanged, 2);
    assert.equal(turn.reply.operationCount, 3);
    assert.equal(turn.reply.revisionId, "rev-1");
    assert.deepEqual(turn.reply.changedPaths, ["index.html", "styles.css"]);
    assert.equal(turn.reply.retryable, false);
  });

  it("offers a retry on failure, and only on failure", () => {
    const failed = conversationFrom([run({ status: "failed", error: "The model returned nothing usable." })]);
    assert.equal(failed[0].reply.kind, "failure");
    assert.equal(failed[0].reply.retryable, true);
    assert.equal(failed[0].reply.error, "The model returned nothing usable.");

    for (const status of ["succeeded", "cancelled", "queued", "running"] as GenerationStatus[]) {
      const [turn] = conversationFrom([run({ status })]);
      assert.equal(turn.reply.retryable, false, `${status} should not be retryable`);
    }
  });

  it("always gives a failure something to show, even with no message", () => {
    const [turn] = conversationFrom([run({ status: "failed", error: null })]);
    assert.ok(turn.reply.error && turn.reply.error.length > 0);
  });

  it("names the stage while a run is in flight and never invents progress", () => {
    const stages: [GenerationStatus, string][] = [
      ["queued", "Queued"],
      ["running", "Orbital is building…"],
      ["validating", "Checking the changes…"],
    ];
    for (const [status, headline] of stages) {
      const [turn] = conversationFrom([run({ status, producedRevisionId: null, applied: null })]);
      assert.equal(turn.reply.kind, "pending");
      assert.equal(turn.reply.headline, headline);
      assert.equal(turn.reply.revisionId, null, "a pending turn must not claim a revision");
      // No percentage anywhere: the pipeline knows its stage, not its progress.
      assert.doesNotMatch(turn.reply.headline, /\d+\s*%/);
    }
  });

  it("marks a cancelled run as cancelled rather than failed", () => {
    const [turn] = conversationFrom([run({ status: "cancelled" })]);
    assert.equal(turn.reply.kind, "cancelled");
    assert.equal(turn.reply.retryable, false);
  });

  it("carries retry lineage through to the turn", () => {
    const [turn] = conversationFrom([run({ isRetry: true, attempt: 3 })]);
    assert.equal(turn.isRetry, true);
    assert.equal(turn.attempt, 3);
  });

  it("says which engine answered, per turn", () => {
    const [model] = conversationFrom([run({ mode: "model" })]);
    const [demo] = conversationFrom([run({ mode: "demo" })]);
    assert.equal(model.mode, "model");
    assert.equal(demo.mode, "demo");
  });

  it("surfaces validation detail on a validation failure", () => {
    const [turn] = conversationFrom([
      run({
        status: "failed",
        error: "The proposed changes did not pass validation.",
        validation: {
          valid: false,
          checkedOperations: 4,
          errors: [
            { code: "unsafePath", message: "Path escapes the project.", path: "../x", operationIndex: 0 },
          ],
          warnings: [],
        },
      }),
    ]);
    assert.equal(turn.reply.validation?.errors.length, 1);
    assert.equal(turn.reply.validation?.checkedOperations, 4);
  });

  it("is empty for a project that has never generated", () => {
    assert.deepEqual(conversationFrom([]), []);
  });
});

describe("isPending", () => {
  it("is true exactly while a turn is unfinished", () => {
    const [live] = conversationFrom([run({ status: "running" })]);
    const [done] = conversationFrom([run({ status: "succeeded" })]);
    assert.equal(isPending(live), true);
    assert.equal(isPending(done), false);
  });
});
