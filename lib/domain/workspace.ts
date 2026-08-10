import type { Timestamp, UserId, WorkspaceId } from "./ids";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface Workspace {
  id: WorkspaceId;
  name: string;
  slug: string;
  createdAt: Timestamp;
}

export interface WorkspaceMember {
  workspaceId: WorkspaceId;
  userId: UserId;
  role: WorkspaceRole;
  joinedAt: Timestamp;
}

/** Ordered least to most privileged, so a check is a comparison rather than a
 *  set of if-branches scattered through the services. */
const ORDER: readonly WorkspaceRole[] = ["viewer", "member", "admin", "owner"];

export function roleAtLeast(role: WorkspaceRole, required: WorkspaceRole): boolean {
  return ORDER.indexOf(role) >= ORDER.indexOf(required);
}
