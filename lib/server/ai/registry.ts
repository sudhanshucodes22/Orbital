/** Resolves the configured model provider. SERVER ONLY.
 *
 * The one place that maps configuration to an adapter. Callers ask for a
 * provider and get whatever is configured; they never name a vendor, never
 * read an API key, and never branch on which model is in use.
 *
 * Adding a vendor is a file under ./providers plus a line in ADAPTERS below —
 * no change to any planner, service or route. That is the property this file
 * exists to protect, and the reason the map is worth having for one entry.
 */
import type { ModelProvider, ProviderId } from "../../ai/types";
import { serverEnv } from "../../config/env";
import { createAnthropicProvider } from "./providers/anthropic";
import { createGeminiProvider } from "./providers/gemini";
import { unconfiguredProvider } from "./unconfigured";
import { withTransportRetry } from "./transport-retry";

/** Factory per provider. Empty until a vendor adapter is written; the type is
 *  what pins the contract so a later addition cannot drift. */
type ProviderFactory = (config: ResolvedModelConfig) => ModelProvider;

const ADAPTERS: Partial<Record<ProviderId, ProviderFactory>> = {
  anthropic: (config) => createAnthropicProvider(config),
  google: (config) => createGeminiProvider(config),
  // openai: (config) => createOpenAiProvider(config),
};

/** Where each provider's key may come from, in order of preference.
 *
 * A vendor-specific variable is checked first because that is the name that
 * vendor's own documentation uses, and someone following those instructions
 * should not have to discover a generic alias. `GENERATION_API_KEY` remains
 * the fallback so a single-provider setup needs only one variable and nothing
 * that already worked stops working. */
const KEY_SOURCES: Partial<Record<ProviderId, (env: ReturnType<typeof serverEnv>) => string | undefined>> = {
  google: (env) => env.geminiApiKey ?? env.generationApiKey,
  anthropic: (env) => env.generationApiKey,
};

export interface ResolvedModelConfig {
  providerId: ProviderId;
  /** Passed to the vendor verbatim. Deliberately not validated against a list
   *  of known models: that list goes stale, and a wrong id should fail at the
   *  vendor with the vendor's own message. */
  modelId: string;
  apiKey: string;
}

const KNOWN: readonly ProviderId[] = ["anthropic", "openai", "google", "custom"];

function parseProviderId(raw: string | undefined): ProviderId | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return (KNOWN as readonly string[]).includes(v) ? (v as ProviderId) : null;
}

/** Configuration for the model, or null when nothing is set up.
 *
 * Null rather than throwing, because "no model configured" is a state the
 * product reports through /api/health and the capability notices, not an
 * error at read time. */
export function resolveModelConfig(): ResolvedModelConfig | null {
  const env = serverEnv();

  // The provider is resolved first, because which key counts depends on it.
  const providerId = parseProviderId(env.generationProvider);
  if (!providerId) return null;
  if (!env.generationModel) return null;

  const apiKey = (KEY_SOURCES[providerId] ?? ((e: typeof env) => e.generationApiKey))(env);
  if (!apiKey) return null;

  return { providerId, modelId: env.generationModel, apiKey };
}

/** Test seam, mirroring `__setContainer`. Lets a suite drive the engine with a
 *  scripted provider instead of a vendor, with no credentials and no network. */
let override: ModelProvider | null = null;

export function __setModelProvider(next: ModelProvider | null) {
  override = next;
}

/** The provider to use. Falls back to one that throws NotConfiguredError,
 *  so a caller that forgets to check gets a clear failure rather than a
 *  silent fabrication. */
export function getModelProvider(): ModelProvider {
  if (override) return override;
  const config = resolveModelConfig();
  if (!config) return unconfiguredProvider;
  const factory = ADAPTERS[config.providerId];
  if (!factory) return unconfiguredProvider;

  // Every adapter gets the same single transport retry. Wrapping here rather
  // than inside each one means a dropped connection is handled once, in the
  // layer that owns transport, and a new vendor inherits it for free.
  return withTransportRetry(factory(config), {
    onRetry: (error) =>
      console.warn(
        `[ai] ${config.providerId} call failed transiently (${error.status ?? "no status"}); retrying once`
      ),
  });
}

/** Whether a real model is available. Used by capability reporting and by
 *  services that must refuse rather than half-run. */
export function hasModelProvider(): boolean {
  if (override) return true;
  const config = resolveModelConfig();
  return Boolean(config && ADAPTERS[config.providerId]);
}
