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

export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

/** Server-only variables. Add new ones here so the audit is in one place. */
export interface ServerEnv {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  storageBucket: string | undefined;
  generationApiKey: string | undefined;
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
    generation: Boolean(e.generationApiKey),
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
  generation: ["GENERATION_API_KEY"],
  publishing: ["a deploy target integration (not yet chosen)"],
};
