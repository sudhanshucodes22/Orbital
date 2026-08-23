/** Typed environment access.
 *
 * Two rules this file exists to enforce:
 *
 * 1. Only `NEXT_PUBLIC_*` values may be read from client code. Everything else
 *    is read through `serverEnv()`, which throws if called in the browser —
 *    so a secret cannot reach the bundle by accident.
 * 2. Nothing is invented. A missing variable makes the corresponding
 *    capability report itself unconfigured rather than falling back to a
 *    default that silently half-works.
 */

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

export const publicEnv = {
  siteUrl: (rawSiteUrl && rawSiteUrl.length > 0 ? rawSiteUrl : (vercelUrl ?? "https://orbital.app")),
} as const;

/** Server-only variables. Add new ones here so the audit is in one place. */
export interface ServerEnv {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  storageBucket: string | undefined;
  generationApiKey: string | undefined;
  /** Provider-specific key for Google Gemini.
   *
   * Read in addition to `GENERATION_API_KEY` rather than instead of it: naming
   * the vendor is what people expect from that vendor's docs, and someone with
   * two providers configured should not have to swap one variable to switch. */
  geminiApiKey: string | undefined;
  /** Which vendor answers, and which model. Read as opaque strings and passed
   *  through: pinning a list of valid model ids here would go stale, and a
   *  wrong one should fail at the vendor with the vendor's own message. */
  generationProvider: string | undefined;
  generationModel: string | undefined;
  /** Shared secret for the worker trigger. Not a user credential: the caller
   *  is a scheduler acting on the whole queue, so there is no session to
   *  check. Absent means the trigger refuses every request. */
  workerSecret: string | undefined;
  /** Vercel Cron's own secret. Vercel sends it as `Authorization: Bearer
   *  $CRON_SECRET` on scheduled invocations, so accepting it means the cron
   *  entry in vercel.json needs no extra wiring. Either secret authorises the
   *  trigger; deployments elsewhere just set WORKER_SECRET. */
  cronSecret: string | undefined;
}

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() was called in the browser. Server configuration must never " +
        "reach the client bundle; use publicEnv for values that may."
    );
  }
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket: process.env.STORAGE_BUCKET,
    generationApiKey: process.env.GENERATION_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    generationProvider: process.env.GENERATION_PROVIDER,
    generationModel: process.env.GENERATION_MODEL,
    workerSecret: process.env.WORKER_SECRET,
    cronSecret: process.env.CRON_SECRET,
  };
}

/** Which capabilities have the configuration they need.
 *
 * Safe to surface to operators (it reports booleans, never values) and used by
 * /api/health and the product pages to explain precisely what is missing.
 */
export type BackendMode = "supabase" | "demo";

export interface CapabilityReport {
  mode: BackendMode;
  auth: boolean;
  database: boolean;
  storage: boolean;
  generation: boolean;
  publishing: boolean;
}

/** Supabase when credentials exist, otherwise the local demo backend.
 *
 * Demo mode is the default rather than an opt-in flag so the project runs
 * end to end on a fresh clone with no configuration at all. Adding
 * SUPABASE_URL and SUPABASE_ANON_KEY switches every capability over; nothing
 * else changes. */
export function backendMode(): BackendMode {
  const e = serverEnv();
  return e.supabaseUrl && e.supabaseAnonKey ? "supabase" : "demo";
}

/** The key that would actually be used for the configured provider.
 *
 * Kept beside `capabilities` and mirroring `KEY_SOURCES` in the AI registry.
 * The two must agree: one reports what the product can do and the other
 * decides it, and a disagreement shows up as /api/health claiming a capability
 * is missing while the feature works, or the reverse. */
function generationKeyFor(e: ServerEnv): string | undefined {
  return e.generationProvider === "google"
    ? (e.geminiApiKey ?? e.generationApiKey)
    : e.generationApiKey;
}

export function capabilities(): CapabilityReport {
  const e = serverEnv();
  const mode = backendMode();

  if (mode === "demo") {
    // The local backend implements every port against a file-backed store, so
    // all of these are genuinely live — nothing here is aspirational.
    // `generation` is a deterministic stub, clearly labelled wherever its
    // output is shown; it is not AI.
    return { mode, auth: true, database: true, storage: true, generation: true, publishing: true };
  }

  return {
    mode,
    auth: true,
    // Projects and workspaces are Supabase tables reached through the same
    // credentials, so the database is live exactly when auth is.
    database: true,
    // Signed upload URLs need the service-role key; the anon key cannot mint
    // them.
    storage: Boolean(e.supabaseServiceRoleKey) && Boolean(e.storageBucket),
    // All three are needed together: a key with no model, or a model with no
    // provider, cannot reach a vendor. Reported as one boolean because that
    // is the question the UI asks — "can this generate?"
    // Mirrors the registry's key resolution rather than checking one variable.
    // The registry reads GEMINI_API_KEY first when the provider is google, so
    // checking only GENERATION_API_KEY here reported generation unavailable
    // while the app could in fact generate — health and behaviour disagreeing
    // is worse than either being wrong alone.
    generation: Boolean(generationKeyFor(e) && e.generationProvider && e.generationModel),
    publishing: false,
  };
}

export const CAPABILITY_REQUIREMENTS: Readonly<Record<Exclude<keyof CapabilityReport, "mode">, readonly string[]>> = {
  auth: ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
  database: ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
  storage: [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STORAGE_BUCKET",
  ],
  generation: ["GENERATION_API_KEY", "GENERATION_PROVIDER", "GENERATION_MODEL"],
  publishing: ["a deploy target integration (not yet chosen)"],
};
