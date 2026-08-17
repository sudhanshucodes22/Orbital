/** The model boundary.
 *
 * Nothing above this file may know which vendor is answering. That is the
 * whole point: swapping Anthropic for OpenAI, or running two side by side,
 * must be a new adapter under lib/server/ai/providers plus a config value —
 * never an edit to a planner, a service or a route.
 *
 * Pure types, no I/O, no SDK imports. Safe to import from anywhere, including
 * a client component that only needs the shape of a model id.
 *
 * Deliberately narrow. It models text in, structured text out, with optional
 * image parts — which is what a code builder needs. It does not model
 * streaming, embeddings or vendor-specific tool protocols. Each of those is a
 * real decision to make when the first concrete requirement arrives, and
 * guessing at them now would bake one vendor's shape into a neutral
 * interface.
 */

export type ProviderId = "anthropic" | "openai" | "google" | "custom";

/** A model the application may be pointed at. Capabilities are declared so a
 *  caller can refuse a job the model cannot do rather than discovering it in a
 *  failure. */
export interface ModelSpec {
  providerId: ProviderId;
  /** Vendor's own identifier, passed through unchanged. */
  modelId: string;
  /** Human label for the run history. */
  label: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  acceptsImages: boolean;
}

export type MessageRole = "system" | "user" | "assistant";

/** Multimodal by construction. Orbital's premise is that a sketch or a
 *  screenshot is a first-class instruction, so the message type cannot be
 *  string-only. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; /** base64, no data: prefix */ data: string };

export interface ModelMessage {
  role: MessageRole;
  content: readonly ContentPart[];
}

export interface ModelRequest {
  messages: readonly ModelMessage[];
  /** Kept separate from `messages` because providers place it differently —
   *  a top-level parameter for some, a first message for others. Normalising
   *  here would force one vendor's shape onto the rest. */
  system?: string;
  maxOutputTokens?: number;
  /** 0 for deterministic work. Code generation wants low values. */
  temperature?: number;
  /** Ask for JSON matching this shape. Providers that support a native
   *  structured-output mode should use it; the rest fall back to prompting
   *  and must still return parseable JSON or fail. */
  jsonSchema?: Record<string, unknown>;
  /** Aborts an in-flight request when the caller gives up. */
  signal?: AbortSignal;
}

export interface ModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ModelResponse {
  text: string;
  usage: ModelUsage;
  modelId: string;
  providerId: ProviderId;
  /** Vendor's stop reason, passed through unnormalised. A truncated response
   *  is a different bug from a refused one, and flattening them loses that. */
  stopReason: string | null;
}

/** What every provider adapter implements.
 *
 * One method. Providers differ enormously in surface area, and the way to keep
 * an abstraction honest is to make it carry only what every implementation can
 * genuinely support.
 */
export interface ModelProvider {
  readonly id: ProviderId;
  readonly spec: ModelSpec;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

/** Convenience for the common all-text message. */
export function textMessage(role: MessageRole, text: string): ModelMessage {
  return { role, content: [{ type: "text", text }] };
}
