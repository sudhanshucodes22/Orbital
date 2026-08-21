/** One bounded retry for transport failures. SERVER ONLY.
 *
 * ## What this is for, and what it is not for
 *
 * A generation can take half a minute and produce a revision. Losing all of
 * that to a single dropped connection is a bad trade when the request is
 * idempotent from the vendor's point of view and a second attempt usually
 * works. That happened in a real run: `Could not reach Gemini`, with the API
 * reachable again moments later.
 *
 * It is deliberately narrow. The only thing retried is a failure the adapter
 * has already classified as transient, and only once:
 *
 *   | Failure                        | retryable | Retried here |
 *   |--------------------------------|-----------|--------------|
 *   | Connection refused / reset     | yes       | once         |
 *   | Timeout                        | yes       | once         |
 *   | 429 rate limited               | yes       | once         |
 *   | 5xx from the vendor            | yes       | once         |
 *   | 401 / 403 rejected credential  | no        | never        |
 *   | 404 unknown model              | no        | never        |
 *   | 400 malformed request          | no        | never        |
 *   | Cancelled by the caller        | no        | never        |
 *
 * Malformed *model output* — JSON that will not parse, operations that fail
 * the schema — is not in this table at all, and cannot be: it is raised by the
 * parser after `complete()` has already returned successfully, so it never
 * reaches this wrapper. Repairing bad output is the pipeline's bounded repair
 * loop, which is a different mechanism with its own limit. Retrying bad output
 * as though it were a dropped packet would just ask the same question twice.
 *
 * ## Why one, and why here
 *
 * One, because a second failure is evidence the problem is not a blip, and an
 * agent that keeps paying to find that out is worse than one that reports it.
 * The existing repair limit is untouched and composes independently: a repair
 * attempt is a fresh call, and each call gets its own single transport retry.
 * Two repairs therefore cost at most four calls, not an unbounded number.
 *
 * Here — wrapping the provider in the registry — because transport is the
 * adapter's concern and every vendor has the same problem. Putting it in the
 * pipeline would mean re-planning on a dropped connection; putting it in each
 * adapter would mean writing it more than once.
 */
import type { ModelProvider, ModelRequest, ModelResponse } from "../../ai/types";
import { ModelCallError } from "./providers/errors";

/** Exactly one automatic retry. Not configurable: a knob here would invite
 *  turning it up, and the argument for one is the argument against three. */
export const MAX_TRANSPORT_ATTEMPTS = 2;

/** A short pause before the second attempt.
 *
 * Not a fix by delay — the retry is the fix, and this only stops the second
 * attempt racing the condition that broke the first. Deliberately brief: a
 * person is watching a build, and a long backoff would be indistinguishable
 * from a hang.
 */
export const TRANSPORT_RETRY_DELAY_MS = 600;

/** Whether a failure is worth a second attempt.
 *
 * Reads the adapter's own classification rather than re-deriving one from a
 * status code. The adapter is where vendor knowledge lives; duplicating that
 * judgement here would be a second thing to keep correct, and the two could
 * disagree about the same error.
 */
export function isRetryable(error: unknown): boolean {
  return error instanceof ModelCallError && error.retryable;
}

/** Wraps a provider so a transient failure gets one more attempt.
 *
 * Returns a provider with the same identity and spec — callers, history and
 * the run record cannot tell the difference, which is the point: a retried
 * call is still one logical call, and the run should not report two.
 */
export function withTransportRetry(
  provider: ModelProvider,
  options: { delayMs?: number; onRetry?: (error: ModelCallError) => void } = {}
): ModelProvider {
  const delayMs = options.delayMs ?? TRANSPORT_RETRY_DELAY_MS;

  return {
    id: provider.id,
    spec: provider.spec,

    async complete(request: ModelRequest): Promise<ModelResponse> {
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_TRANSPORT_ATTEMPTS; attempt++) {
        try {
          return await provider.complete(request);
        } catch (error) {
          lastError = error;

          const isLast = attempt === MAX_TRANSPORT_ATTEMPTS;
          if (isLast || !isRetryable(error)) {
            // Rethrown unchanged, so the pipeline records the vendor's own
            // reason rather than a wrapper's paraphrase of it.
            throw error;
          }

          // An abort is the caller withdrawing, not the network failing.
          // Retrying it would ignore the withdrawal.
          if (request.signal?.aborted) throw error;

          options.onRetry?.(error as ModelCallError);
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      // Unreachable: the loop either returns or throws. Present so the
      // function has no implicit undefined path.
      throw lastError;
    },
  };
}
