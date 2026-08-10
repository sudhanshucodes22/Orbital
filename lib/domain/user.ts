import type { Timestamp, UserId, WorkspaceId } from "./ids";

export interface User {
  id: UserId;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Timestamp;
}

/** What a request knows about the caller. Deliberately minimal: anything more
 *  should be fetched through a repository rather than smuggled in a session. */
export interface Session {
  user: User;
  /** The workspace the user is currently acting in. */
  activeWorkspaceId: WorkspaceId;
  expiresAt: Timestamp;
}
