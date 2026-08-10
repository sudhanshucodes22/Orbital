/** Row shapes as they come back from Postgres, and the mapping to domain
 *  types. Kept separate so the snake_case/camelCase boundary lives in exactly
 *  one place and the rest of the codebase never sees a database column name.
 */
import {
  asProjectId,
  asRevisionId,
  asUserId,
  asWorkspaceId,
  type Project,
  type ProjectStatus,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceRole,
} from "../../domain";

export interface ProjectRow {
  id: string;
  workspace_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  status: string;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface WorkspaceMemberRow {
  workspace_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

const PROJECT_STATUSES: readonly ProjectStatus[] = ["draft", "generating", "ready", "failed"];
const ROLES: readonly WorkspaceRole[] = ["owner", "admin", "member", "viewer"];

/** Postgres enums and TypeScript unions can drift. Narrow explicitly rather
 *  than casting, so a schema change surfaces here instead of somewhere far
 *  downstream. */
const toStatus = (v: string): ProjectStatus =>
  (PROJECT_STATUSES as readonly string[]).includes(v) ? (v as ProjectStatus) : "draft";

const toRole = (v: string): WorkspaceRole =>
  (ROLES as readonly string[]).includes(v) ? (v as WorkspaceRole) : "viewer";

export const toProject = (r: ProjectRow): Project => ({
  id: asProjectId(r.id),
  workspaceId: asWorkspaceId(r.workspace_id),
  ownerId: asUserId(r.owner_id),
  name: r.name,
  description: r.description,
  status: toStatus(r.status),
  currentRevisionId: r.current_revision_id ? asRevisionId(r.current_revision_id) : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const toWorkspace = (r: WorkspaceRow): Workspace => ({
  id: asWorkspaceId(r.id),
  name: r.name,
  slug: r.slug,
  createdAt: r.created_at,
});

export const toMember = (r: WorkspaceMemberRow): WorkspaceMember => ({
  workspaceId: asWorkspaceId(r.workspace_id),
  userId: asUserId(r.user_id),
  role: toRole(r.role),
  joinedAt: r.joined_at,
});
