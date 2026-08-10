/** AuthPort backed by Supabase Auth. SERVER ONLY. */
import { asUserId, asWorkspaceId, type Session } from "../../domain";
import type { AuthPort } from "../../ports";
import { getSupabaseServerClient } from "./client";

export const supabaseAuth: AuthPort = {
  async getSession(): Promise<Session | null> {
    const supabase = await getSupabaseServerClient();

    // getUser() revalidates the JWT against the auth server. getSession()
    // would be cheaper but returns whatever is in the cookie, which a client
    // can tamper with — never trust it for authorisation.
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) return null;
    const u = userData.user;

    // The personal workspace is created by a database trigger on sign-up, so
    // exactly one row is expected here. If it is missing the account is
    // half-provisioned and treating it as signed-out is safer than guessing.
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", u.id)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) return null;

    const meta = (u.user_metadata ?? {}) as { display_name?: string; avatar_url?: string };

    return {
      user: {
        id: asUserId(u.id),
        email: u.email ?? "",
        displayName: meta.display_name ?? null,
        avatarUrl: meta.avatar_url ?? null,
        createdAt: u.created_at,
      },
      activeWorkspaceId: asWorkspaceId(membership.workspace_id as string),
      // Supabase manages refresh; this is informational for the UI only.
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  },

  async signOut(): Promise<void> {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.signOut();
  },
};
