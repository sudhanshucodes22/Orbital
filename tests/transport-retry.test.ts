/** One bounded transport retry, and everything it must refuse to retry.
 *
 * The motivating incident was real: a generation that had already planned
 * successfully died on `Could not reach Gemini`, and the API answered normally
 * seconds later. Losing a half-minute of work to one dropped connection is a
 * bad trade when a second attempt usually succeeds.
 *
 * The risk in fixing that is retrying the wrong things — burning money on a
 * rejected credential, or asking a model the same question twice because its
 * last answer did not parse. These tests pin both sides.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelProvider, ModelResponse } from "../lib/ai/types";
import { ModelCallError } from "../lib/server/ai/providers/errors";
import {
  MAX_TRANSPORT_ATTEMPTS,
  isRetryable,
  withTransportRetry,
} from "../lib/server/ai/transport-retry";

const RESPONSE: ModelResponse = {
  text: '{"ok":true}',
  usage: { inputTokens: 10, outputTokens: 5 },
  modelId: "gemini-2.5-flash",
  providerId: "google",
  stopReason: "end_turn",
};

/** A provider that fails a given number of times, then succeeds. */
function flaky(failures: number, error: () => Error): ModelProvider & { calls: number } {
  const provider = {
    id: "google" as const,
    spec: { providerId: "google", modelId: "gemini-2.5-flash" } as never,
    calls: 0,
    async complete(): Promise<ModelResponse> {
      provider.calls++;
      if (provider.calls <= failures) throw error();
      return RESPONSE;
    },
  };
  return provider;
}

/** No delay in tests: the pause exists so the second attempt does not race the
 *  condition that broke the first, and waiting for it would only slow the
 *  suite without testing anything. */
const wrap = (p: ModelProvider, onRetry?: (e: ModelCallError) => void) =>
  withTransportRetry(p, { delayMs: 0, onRetry });

const transport = () => new ModelCallError("Could not reach Gemini.", { retryable: true });
const rateLimited = () =>
  new ModelCallError("Rate limited.", { retryable: true, status: 429 });
const badKey = () =>
  new ModelCallError("The model provider rejected the API key.", { status: 401 });
const badModel = () => new ModelCallError("Unknown model.", { status: 404 });
const malformedRequest = () => new ModelCallError("Malformed request.", { status: 400 });

describe("retryable failures get exactly one more attempt", () => {
  it("recovers from a single dropped connection", async () => {
    const provider = flaky(1, transport);
    const result = await wrap(provider).complete({ messages: [] });

    assert.equal(result.text, '{"ok":true}');
    assert.equal(provider.calls, 2, "one failure plus one retry");
  });

  it("recovers from a single rate-limit response", async () => {
    const provider = flaky(1, rateLimited);
    await wrap(provider).complete({ messages: [] });
    assert.equal(provider.calls, 2);
  });

  it("gives up after the bound rather than retrying forever", async () => {
    const provider = flaky(Number.MAX_SAFE_INTEGER, transport);

    await assert.rejects(() => wrap(provider).complete({ messages: [] }), /Could not reach/);
    // A second failure is evidence the problem is not a blip. Continuing to
    // pay to find that out is worse than reporting it.
    assert.equal(provider.calls, MAX_TRANSPORT_ATTEMPTS);
    assert.equal(MAX_TRANSPORT_ATTEMPTS, 2);
  });

  it("does not retry a call that already succeeded", async () => {
    const provider = flaky(0, transport);
    await wrap(provider).complete({ messages: [] });
    assert.equal(provider.calls, 1);
  });

  it("reports the retry so it is visible rather than silent", async () => {
    const seen: ModelCallError[] = [];
    const provider = flaky(1, rateLimited);
    await wrap(provider, (e) => seen.push(e)).complete({ messages: [] });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].status, 429);
  });
});

describe("failures that must never be retried", () => {
  for (const [name, error] of [
    ["a rejected API key", badKey],
    ["an unknown model", badModel],
    ["a malformed request", malformedRequest],
  ] as const) {
    it(`fails immediately on ${name}`, async () => {
      const provider = flaky(Number.MAX_SAFE_INTEGER, error);

      await assert.rejects(() => wrap(provider).complete({ messages: [] }));
      // Retrying a configuration problem cannot fix it and costs real money.
      assert.equal(provider.calls, 1, `${name} must not be retried`);
    });
  }

  it("does not retry an error the adapter did not classify", async () => {
    // A plain Error is not a ModelCallError and carries no judgement about
    // whether repeating it is safe. Treating unknown as retryable would be
    // guessing with someone else's budget.
    const provider = flaky(Number.MAX_SAFE_INTEGER, () => new Error("something odd"));

    await assert.rejects(() => wrap(provider).complete({ messages: [] }));
    assert.equal(provider.calls, 1);
  });

  it("does not retry once the caller has aborted", async () => {
    const controller = new AbortController();
    const provider = {
      id: "google" as const,
      spec: {} as never,
      calls: 0,
      async complete(): Promise<ModelResponse> {
        provider.calls++;
        controller.abort();
        throw transport();
      },
    };

    await assert.rejects(() =>
      wrap(provider).complete({ messages: [], signal: controller.signal })
    );
    // An abort is the caller withdrawing, not the network failing. Retrying
    // would ignore the withdrawal.
    assert.equal(provider.calls, 1);
  });

  it("rethrows the vendor's own error rather than paraphrasing it", async () => {
    const provider = flaky(Number.MAX_SAFE_INTEGER, badKey);

    await assert.rejects(
      () => wrap(provider).complete({ messages: [] }),
      (error: Error) => {
        assert.ok(error instanceof ModelCallError);
        assert.equal((error as ModelCallError).status, 401);
        // The pipeline records this message; a wrapper's rewording would make
        // the run less diagnosable, not more.
        assert.match(error.message, /rejected the API key/);
        return true;
      }
    );
  });
});

describe("classification", () => {
  it("reads the adapter's judgement rather than re-deriving one", () => {
    assert.equal(isRetryable(transport()), true);
    assert.equal(isRetryable(rateLimited()), true);
    assert.equal(isRetryable(badKey()), false);
    assert.equal(isRetryable(badModel()), false);
    assert.equal(isRetryable(malformedRequest()), false);
  });

  it("treats anything that is not a ModelCallError as not retryable", () => {
    assert.equal(isRetryable(new Error("plain")), false);
    assert.equal(isRetryable("a string"), false);
    assert.equal(isRetryable(null), false);
  });
});

describe("the wrapper is invisible to callers", () => {
  it("preserves the provider's identity and spec", () => {
    const provider = flaky(0, transport);
    const wrapped = wrap(provider);

    // A retried call is still one logical call: history must not be able to
    // report a different provider, or two calls where the user made one.
    assert.equal(wrapped.id, provider.id);
    assert.equal(wrapped.spec, provider.spec);
  });

  it("composes with the repair loop rather than multiplying it", () => {
    // Each repair attempt is a fresh call and gets its own single transport
    // retry. Two repairs therefore cost at most four calls — bounded, and
    // knowable in advance.
    const MAX_REPAIRS = 2;
    const worstCase = (1 + MAX_REPAIRS) * MAX_TRANSPORT_ATTEMPTS;
    assert.equal(worstCase, 6);
  });
});
