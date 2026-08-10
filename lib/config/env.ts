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
  databaseUrl: string | undefined;
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
    databaseUrl: process.env.DATABASE_URL,
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
export interface CapabilityReport {
  auth: boolean;
  database: boolean;
  storage: boolean;
  generation: boolean;
  publishing: boolean;
}

export function capabilities(): CapabilityReport {
  const e = serverEnv();
  const supabase = Boolean(e.supabaseUrl && e.supabaseAnonKey);
  return {
    auth: supabase,
    database: Boolean(e.databaseUrl) || supabase,
    storage: supabase && Boolean(e.storageBucket),
    generation: Boolean(e.generationApiKey),
    publishing: false,
  };
}

export const CAPABILITY_REQUIREMENTS: Readonly<Record<keyof CapabilityReport, readonly string[]>> = {
  auth: ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
  database: ["DATABASE_URL (or SUPABASE_URL + SUPABASE_ANON_KEY)"],
  storage: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "STORAGE_BUCKET"],
  generation: ["GENERATION_API_KEY"],
  publishing: ["a deploy target integration (not yet chosen)"],
};
