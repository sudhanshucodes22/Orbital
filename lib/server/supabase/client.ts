/** Supabase clients. SERVER ONLY.
 *
 * Auth runs entirely through Server Actions and Route Handlers, so no
 * Supabase client is ever constructed in the browser and the anon key stays
 * out of the client bundle. That is stricter than the usual Next.js setup,
 * which publishes the anon key as NEXT_PUBLIC_. The anon key is designed to be
 * publishable — Row Level Security is what actually protects the data — but
 * there is no reason to ship it when nothing in the browser needs it.
 *
 * Session state lives in cookies written by these clients, which is what lets
 * middleware refresh it and Server Components read it.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NotConfiguredError } from "../../errors";
import { CAPABILITY_REQUIREMENTS, serverEnv } from "../../config/env";

function credentials(): { url: string; anonKey: string } {
  const { supabaseUrl, supabaseAnonKey } = serverEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new NotConfiguredError("auth", CAPABILITY_REQUIREMENTS.auth);
  }
  return { url: supabaseUrl, anonKey: supabaseAnonKey };
}

/** Request-scoped client that reads and writes the session cookies.
 *
 * Safe to call from Server Components: cookie writes throw there, and Next
 * gives no way to detect that context, so the setter swallows the error. The
 * write that matters happens in middleware, which runs on every request. */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const { url, anonKey } = credentials();
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, options);
          }
        } catch {
          // Server Component render pass — middleware refreshes instead.
        }
      },
    },
  });
}

/** Privileged client that bypasses Row Level Security.
 *
 * Only for operations that legitimately act outside a user's own rows, such
 * as minting signed storage URLs. Never expose its results directly; the
 * caller is responsible for having already authorised the request.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const { supabaseUrl, supabaseServiceRoleKey } = serverEnv();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new NotConfiguredError("storage", CAPABILITY_REQUIREMENTS.storage);
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
