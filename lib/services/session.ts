import type { Session } from "../domain";
import { UnauthenticatedError } from "../errors";
import { getContainer } from "../server/container";

/** The session, or null. Use in layouts that render differently when signed out. */
export async function getSession(): Promise<Session | null> {
  return getContainer().auth.getSession();
}

/** The session, or throw. Use in anything that cannot function signed out. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthenticatedError();
  return session;
}
