import type { ProjectId, RevisionId, Timestamp, UserId, WorkspaceId } from "./ids";

export type ProjectStatus = "draft" | "generating" | "ready" | "failed";

export interface Project {
  id: ProjectId;
  workspaceId: WorkspaceId;
  name: string;
  status: ProjectStatus;
  /** The revision currently shown in the editor. Null before first generation. */
  currentRevisionId: RevisionId | null;
  createdBy: UserId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateProjectInput {
  workspaceId: WorkspaceId;
  name: string;
}

export interface UpdateProjectInput {
  name?: string;
}
