/** The error every provider adapter raises. SERVER ONLY.
 *
 * Vendor SDKs and HTTP responses are translated into this at the adapter
 * boundary, so nothing upstream has to know which vendor is configured to
 * understand what went wrong. That is what keeps the planner, the pipeline and
 * the UI free of vendor branching.
 *
 * Extracted from the Anthropic adapter when a second provider arrived: two
 * adapters each defining their own error class would mean the pipeline had to
 * catch two things that meant the same thing.
 *
 * Nothing constructed here may carry a credential. Adapters build the message
 * themselves from a status code and a known-safe description — never by
 * interpolating a raw response body, which can echo a request header.
 */
export class ModelCallError extends Error {
  /** Whether trying again could plausibly succeed. A rate limit or a timeout
   *  is retryable; a rejected key is not, and retrying it just burns time. */
  readonly retryable: boolean;
  /** HTTP status where there was one, for machine-readable handling. */
  readonly status: number | null;

  constructor(message: string, options: { retryable?: boolean; status?: number | null } = {}) {
    super(message);
    this.name = "ModelCallError";
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
  }
}

/** Maps an HTTP status to a message written for the person who will read it.
 *
 * Shared because every HTTP-based provider needs the same mapping, and because
 * the messages are the ones users see — they should not drift between vendors.
 * The variable name is named where it helps; a value never is.
 */
export function describeHttpFailure(
  status: number,
  vendor: string,
  keyVariable: string
): ModelCallError {
  if (status === 401 || status === 403) {
    return new ModelCallError(
      `${vendor} rejected the API key. Check ${keyVariable}.`,
      { status }
    );
  }
  if (status === 404) {
    return new ModelCallError(
      `${vendor} does not recognise the configured model. Check GENERATION_MODEL.`,
      { status }
    );
  }
  if (status === 429) {
    return new ModelCallError(
      `${vendor} is rate limiting requests. Try again shortly.`,
      { retryable: true, status }
    );
  }
  if (status === 400) {
    return new ModelCallError(
      `${vendor} rejected the request as malformed.`,
      { status }
    );
  }
  if (status >= 500) {
    return new ModelCallError(`${vendor} is unavailable right now.`, {
      retryable: true,
      status,
    });
  }
  return new ModelCallError(`${vendor} returned an unexpected error.`, { status });
}
