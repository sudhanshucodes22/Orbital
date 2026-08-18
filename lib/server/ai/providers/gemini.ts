/** Google Gemini, via the Interactions API. SERVER ONLY.
 *
 * ## Why REST rather than an SDK
 *
 * `ModelProvider` is one method that takes messages and returns text. A vendor
 * SDK for that is a dependency, a supply-chain surface and a version to keep
 * current, in exchange for wrapping a single POST. `fetch` is built into the
 * runtime and the request shape is small, so this adapter adds no dependency
 * at all.
 *
 * ## Why the Interactions API rather than generateContent
 *
 * Google's own reference says the Interactions API is generally available and
 * is what new integrations should use; `generateContent` is described as a
 * standard REST endpoint kept for specific cases. Building a new adapter
 * against the older surface would be starting in the position of needing to
 * migrate. Checked against the documentation rather than assumed — the model
 * IDs in particular have moved, and `gemini-2.0-flash` is now shut down.
 *
 * ## What this adapter is careful about
 *
 * The response is parsed defensively. This was written from documentation
 * without a live call to check it against, so a shape that does not match
 * expectations produces a clear `ModelCallError` rather than a crash or —
 * worse — an empty string that the planner would treat as unusable output and
 * blame on the model.
 */
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelSpec,
} from "../../../ai/types";
import type { ResolvedModelConfig } from "../registry";
import { ModelCallError, describeHttpFailure } from "./errors";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const VENDOR = "Gemini";

/** Which environment variable holds the key, for error messages. Named so a
 *  failure tells someone what to fix; the value is never included. */
const KEY_VARIABLE = "GEMINI_API_KEY";

/** Generous for a code generator, which returns whole files. */
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

/** A stuck request must not hold a generation lease open. */
const REQUEST_TIMEOUT_MS = 120_000;

/** Free-tier, stable, and good at structured output. Documented rather than
 *  enforced: the registry passes `GENERATION_MODEL` through verbatim, because
 *  a hard-coded allow-list goes stale and a wrong id should fail at the vendor
 *  with the vendor's own message. */
export const RECOMMENDED_GEMINI_MODEL = "gemini-2.5-flash";

/** Flattens the neutral message type into the Interactions API's `input`.
 *
 * Gemini takes a system instruction as its own top-level field, so a `system`
 * role in the neutral type is lifted out rather than prepended to the
 * conversation — the same treatment the Anthropic adapter gives it.
 */
function toInput(request: ModelRequest) {
  return request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      // Gemini names the assistant "model".
      role: message.role === "assistant" ? "model" : "user",
      parts: message.content.map((part) =>
        part.type === "text"
          ? { text: part.text }
          : {
              inline_data: {
                mime_type: part.mimeType,
                data: part.data,
              },
            }
      ),
    }));
}

/** The system instruction, whether it arrived as a field or a message. */
function systemFrom(request: ModelRequest): string | undefined {
  if (request.system) return request.system;
  const systemMessage = request.messages.find((m) => m.role === "system");
  if (!systemMessage) return undefined;
  return systemMessage.content
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** Pulls the generated text out of the response.
 *
 * The documented location is `steps[].content[].text`, and every step's text
 * is concatenated because a response may be split across them. The fallbacks
 * below cover the shapes the older endpoint used, so a deployment pointed at a
 * slightly different surface degrades to working rather than to an empty
 * string that would be misreported as the model returning nothing.
 */
function extractText(body: unknown): string {
  const root = body as Record<string, unknown> | null;
  if (!root || typeof root !== "object") return "";

  const collect = (content: unknown): string => {
    if (!Array.isArray(content)) return "";
    return content
      .map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : ""
      )
      .join("");
  };

  // Interactions API: steps[].content[].text
  const steps = root.steps;
  if (Array.isArray(steps)) {
    const text = steps
      .map((step) =>
        step && typeof step === "object" ? collect((step as { content?: unknown }).content) : ""
      )
      .join("");
    if (text) return text;
  }

  // generateContent: candidates[].content.parts[].text
  const candidates = root.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const first = candidates[0] as { content?: { parts?: unknown } };
    const text = collect(first?.content?.parts);
    if (text) return text;
  }

  // A bare top-level output, which the docs' short examples show.
  if (typeof root.output === "string") return root.output;
  if (typeof root.text === "string") return root.text;

  return "";
}

/** Token usage, tolerating either naming. */
function extractUsage(body: unknown): { inputTokens: number | null; outputTokens: number | null } {
  const root = body as Record<string, unknown> | null;
  const usage = (root?.usage ?? root?.usageMetadata) as Record<string, unknown> | undefined;
  if (!usage) return { inputTokens: null, outputTokens: null };

  const num = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = usage[key];
      if (typeof value === "number") return value;
    }
    return null;
  };

  return {
    inputTokens: num("total_input_tokens", "promptTokenCount", "input_tokens"),
    outputTokens: num("total_output_tokens", "candidatesTokenCount", "output_tokens"),
  };
}

/** Why the model stopped, passed through unnormalised.
 *
 * A truncated response is a different bug from a refused one, and flattening
 * them loses that — the same reason the neutral type keeps this as a string. */
function extractStopReason(body: unknown): string | null {
  const root = body as Record<string, unknown> | null;
  if (typeof root?.status === "string") return root.status;
  const candidates = root?.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const reason = (candidates[0] as { finishReason?: unknown }).finishReason;
    if (typeof reason === "string") return reason;
  }
  return null;
}

export function createGeminiProvider(config: ResolvedModelConfig): ModelProvider {
  const spec: ModelSpec = {
    providerId: "google",
    modelId: config.modelId,
    label: `Gemini · ${config.modelId}`,
    // Conservative. Gemini's context is far larger, but this is used to refuse
    // a job before sending it, and under-promising costs nothing.
    maxInputTokens: 1_000_000,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    acceptsImages: true,
  };

  return {
    id: "google",
    spec,

    async complete(request: ModelRequest): Promise<ModelResponse> {
      const system = systemFrom(request);

      const payload: Record<string, unknown> = {
        model: config.modelId,
        input: toInput(request),
        generation_config: {
          max_output_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        },
      };

      if (system) payload.system_instruction = system;

      // Native structured output. Better than asking for JSON in the prompt:
      // the vendor enforces the shape, so a response that does not match is
      // the vendor's failure rather than something the parser has to survive.
      if (request.jsonSchema) {
        payload.response_format = {
          type: "json_schema",
          mime_type: "application/json",
          schema: request.jsonSchema,
        };
      }

      // Its own timeout, combined with any the caller supplied, so a hung
      // request cannot hold a generation lease open until it expires.
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const signal = request.signal
        ? AbortSignal.any([request.signal, timeout])
        : timeout;

      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            // Header rather than a query parameter: a URL is logged by
            // proxies and appears in error messages, and a key in one is a
            // key in a log file.
            "x-goog-api-key": config.apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
          signal,
        });
      } catch (error) {
        // Aborts and network failures never carry a body worth quoting, and
        // an arbitrary error message can echo the request.
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new ModelCallError(`${VENDOR} did not respond in time.`, {
            retryable: true,
          });
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new ModelCallError("The generation was cancelled.", { retryable: false });
        }
        throw new ModelCallError(`Could not reach ${VENDOR}.`, { retryable: true });
      }

      if (!response.ok) {
        // The body is read and discarded rather than included: Google's error
        // payloads can echo request metadata, and this message is persisted on
        // a run and shown in a browser.
        await response.text().catch(() => "");
        throw describeHttpFailure(response.status, VENDOR, KEY_VARIABLE);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ModelCallError(`${VENDOR} returned a response that was not JSON.`, {
          retryable: true,
        });
      }

      const text = extractText(body);
      if (!text) {
        // Distinguished from "the model wrote something unparseable": that is
        // the planner's problem to report, whereas this is the adapter failing
        // to find the text at all, which is a different fix.
        throw new ModelCallError(
          `${VENDOR} returned no text. The response shape may have changed.`,
          { retryable: true, status: response.status }
        );
      }

      const usage = extractUsage(body);

      return {
        text,
        usage,
        modelId: config.modelId,
        providerId: "google",
        stopReason: extractStopReason(body),
      };
    },
  };
}
