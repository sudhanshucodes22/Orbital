/** Anthropic adapter. SERVER ONLY.
 *
 * The only file in the repository that imports a vendor SDK or knows a vendor
 * name. Everything above it sees `ModelProvider`. If this file is the only
 * thing that changes when swapping vendors, the abstraction is doing its job.
 *
 * Three decisions worth stating:
 *
 *  - It streams and then collects with `finalMessage()`. Code generation can
 *    legitimately produce tens of thousands of tokens, and a non-streaming
 *    request at that size hits the SDK's HTTP timeout. Streaming costs nothing
 *    here because the caller wants the whole document anyway.
 *
 *  - It sends no sampling parameters. The current models reject `temperature`,
 *    `top_p` and `top_k` with a 400. The neutral `ModelRequest` keeps the field
 *    because other vendors accept it; this adapter drops it rather than letting
 *    a caller's harmless-looking `temperature: 0` fail the request.
 *
 *  - Errors are translated at this boundary. A `RateLimitError` from the SDK
 *    becomes a message the product can show; the vendor's exception type never
 *    escapes, because catching it upstream would mean upstream knows the
 *    vendor.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentPart,
  ModelMessage,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelSpec,
} from "../../../ai/types";
import type { ResolvedModelConfig } from "../registry";

/** Conservative ceilings, used only to describe the provider. The vendor is
 *  the authority on real limits and will say so if a request exceeds them. */
const DEFAULT_MAX_INPUT_TOKENS = 200_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 64_000;

/** Public error for anything the vendor rejected or failed on.
 *
 * A single type rather than a taxonomy: callers here need to record the
 * message on the run and stop. `retryable` is the one distinction that changes
 * behaviour, so it is the one distinction modelled. */
export class ModelCallError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, options: { retryable?: boolean; status?: number | null } = {}) {
    super(message);
    this.name = "ModelCallError";
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
  }
}

function toAnthropicContent(parts: readonly ContentPart[]): Anthropic.ContentBlockParam[] {
  return parts.map((part) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: part.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
            data: part.data,
          },
        }
  );
}

function toAnthropicMessages(messages: readonly ModelMessage[]): Anthropic.MessageParam[] {
  // A `system` role in the neutral type is folded into the top-level `system`
  // parameter by the caller; anything left here is a user or assistant turn.
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: toAnthropicContent(m.content),
    }));
}

/** Maps the SDK's typed exceptions onto one product-facing error.
 *
 * Ordered most-specific first, as the SDK's class hierarchy requires —
 * `APIConnectionError` extends `APIError` here, so it must be tested first or
 * a network failure would be reported as an API failure. */
function translate(error: unknown): ModelCallError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new ModelCallError(
      "The model provider rejected the API key. Check GENERATION_API_KEY.",
      { status: error.status ?? 401 }
    );
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new ModelCallError(
      "The configured key does not have access to this model.",
      { status: error.status ?? 403 }
    );
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ModelCallError(
      "The configured model does not exist. Check GENERATION_MODEL.",
      { status: error.status ?? 404 }
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ModelCallError("The model provider is rate limiting requests. Try again shortly.", {
      retryable: true,
      status: error.status ?? 429,
    });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ModelCallError(`The model provider rejected the request: ${error.message}`, {
      status: error.status ?? 400,
    });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ModelCallError("Could not reach the model provider.", { retryable: true });
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? null;
    return new ModelCallError(`The model provider failed: ${error.message}`, {
      retryable: status === null || status >= 500,
      status,
    });
  }
  return new ModelCallError(
    error instanceof Error ? error.message : "Unknown model provider failure."
  );
}

export function createAnthropicProvider(config: ResolvedModelConfig): ModelProvider {
  const client = new Anthropic({ apiKey: config.apiKey });

  const spec: ModelSpec = {
    providerId: "anthropic",
    modelId: config.modelId,
    label: `Anthropic ${config.modelId}`,
    maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    acceptsImages: true,
  };

  return {
    id: "anthropic",
    spec,

    async complete(request: ModelRequest): Promise<ModelResponse> {
      const maxTokens = request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

      try {
        const stream = client.messages.stream(
          {
            model: config.modelId,
            max_tokens: maxTokens,
            ...(request.system ? { system: request.system } : {}),
            messages: toAnthropicMessages(request.messages),
            // Planning and code generation both benefit from thinking; the
            // model decides how much per request rather than being handed a
            // fixed budget.
            thinking: { type: "adaptive" },
            output_config: {
              effort: "high",
              ...(request.jsonSchema
                ? { format: { type: "json_schema" as const, schema: request.jsonSchema } }
                : {}),
            },
          },
          request.signal ? { signal: request.signal } : undefined
        );

        const message = await stream.finalMessage();

        // Checked before reading content: a refusal carries no usable output,
        // and a caller that indexed into content[0] would throw on it.
        if (message.stop_reason === "refusal") {
          throw new ModelCallError(
            "The model declined this request. Rephrase the instruction and try again."
          );
        }

        const text = message.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");

        // Truncation is reported rather than returned as if complete —
        // half a JSON document would fail parsing with a far less useful
        // message than this one.
        if (message.stop_reason === "max_tokens") {
          throw new ModelCallError(
            `The model hit its ${maxTokens}-token output limit before finishing. ` +
              "Try a narrower instruction."
          );
        }

        return {
          text,
          usage: {
            inputTokens: message.usage.input_tokens ?? null,
            outputTokens: message.usage.output_tokens ?? null,
          },
          modelId: message.model ?? config.modelId,
          providerId: "anthropic",
          stopReason: message.stop_reason ?? null,
        };
      } catch (error) {
        if (error instanceof ModelCallError) throw error;
        throw translate(error);
      }
    },
  };
}
