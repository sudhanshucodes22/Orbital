/** AuthPort for local demo mode. SERVER ONLY.
 *
 * Real accounts with hashed passwords and signed session cookies, stored in
 * the local file database. Same contract as the Supabase adapter, so nothing
 * above this layer knows which one is running.
 */
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { asUserId, asWorkspaceId, type Session } from "../../domain";
import type { AuthPort, AuthResult } from "../../ports";
import { SESSION_COOKIE, hashPassword, signSession, verifyPassword, verifySession } from "./crypto";
import { mutate, nowIso, read } from "./store";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

async function setSessionCookie(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
    // Demo runs over plain http on localhost, so Secure would stop the cookie
    // being set at all. The Supabase path handles production.
    secure: false,
  });
}

export const demoAuth: AuthPort = {
  async getSession(): Promise<Session | null> {
    const store = await cookies();
    const userId = verifySession(store.get(SESSION_COOKIE)?.value);
    if (!userId) return null;

    return read((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) return null;
      const membership = db.members.find((m) => m.userId === userId);
      if (!membership) return null;
      return {
        user: {
          id: asUserId(user.id),
          email: user.email,
          displayName: user.displayName,
          avatarUrl: null,
          createdAt: user.createdAt,
        },
        activeWorkspaceId: asWorkspaceId(membership.workspaceId),
        expiresAt: new Date(Date.now() + THIRTY_DAYS * 1000).toISOString(),
      } satisfies Session;
    });
  },

  async signIn(email, password): Promise<AuthResult> {
    const normalised = email.trim().toLowerCase();
    const user = await read((db) => db.users.find((u) => u.email === normalised) ?? null);
    // Same message either way — distinguishing them would let anyone probe
    // which addresses have accounts.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return { ok: false, message: "Those credentials did not work." };
    }
    await setSessionCookie(user.id);
    return { ok: true };
  },

  async signUp({ email, password, displayName }): Promise<AuthResult> {
    const normalised = email.trim().toLowerCase();

    const created = await mutate((db) => {
      if (db.users.some((u) => u.email === normalised)) return null;

      const userId = randomUUID();
      const workspaceId = randomUUID();
      const label = displayName?.trim() || normalised.split("@")[0];

      db.users.push({
        id: userId,
        email: normalised,
        displayName: displayName?.trim() || null,
        passwordHash: hashPassword(password),
        createdAt: nowIso(),
      });
      // Mirrors the Supabase trigger: every account gets a personal workspace.
      db.workspaces.push({
        id: workspaceId,
        name: `${label}'s workspace`,
        slug: `w-${workspaceId.replace(/-/g, "")}`,
        createdAt: nowIso(),
      });
      db.members.push({
        workspaceId,
        userId,
        role: "owner",
        joinedAt: nowIso(),
      });
      return userId;
    });

    if (!created) return { ok: false, message: "An account with that email already exists." };
    await setSessionCookie(created);
    // No email round-trip in demo mode, so the user is signed in immediately.
    return { ok: true, needsConfirmation: false };
  },

  async signOut(): Promise<void> {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
  },
};
