import type { ProjectId, RevisionId, Timestamp, UserId, WorkspaceId } from "./ids";

export type ProjectStatus = "draft" | "generating" | "ready" | "failed";

export interface Project {
  id: ProjectId;
  /** The workspace the project belongs to. Every user gets a personal
   *  workspace on sign-up, so this is how "owned by me" is expressed today
   *  while leaving room for shared workspaces later. */
  workspaceId: WorkspaceId;
  /** The user who owns the project. Denormalised alongside workspaceId so a
   *  row can be authorised without a join, which is what the RLS policies
   *  rely on. */
  ownerId: UserId;
  name: string;
  description: string | null;
  status: ProjectStatus;
  /** The revision currently shown in the editor. Null before first generation. */
  currentRevisionId: RevisionId | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateProjectInput {
  workspaceId: WorkspaceId;
  name: string;
  description?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}
