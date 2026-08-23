/** WorkspaceRepository and ProjectRepository backed by Supabase. SERVER ONLY.
 *
 * For a request, every query runs through the request-scoped cookie client, so
 * Row Level Security applies with the caller's identity. The service layer's
 * role checks and RLS are deliberately both present: the services give good
 * error messages, RLS is the boundary that actually holds if a service is
 * bypassed.
 *
 * The client is a parameter for the same reason it is one in `builder.ts`: run
 * execution has no session to build a cookie client from. See
 * `workerProjectRepositories` at the bottom.
 */
import type {
  CreateProjectInput,
  Project,
  ProjectId,
  UpdateProjectInput,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceMember,
} from "../../domain";
import type { ProjectRepository, WorkspaceRepository } from "../../ports";
import { getSupabaseAdminClient, getSupabaseServerClient } from "./client";
import type { ClientFactory } from "./builder";
import {
  toMember,
  toProject,
  toWorkspace,
  type ProjectRow,
  type WorkspaceMemberRow,
  type WorkspaceRow,
} from "./rows";

const PROJECT_COLUMNS =
  "id, workspace_id, owner_id, name, description, status, current_revision_id, created_at, updated_at";

/** Postgres "no rows" from .single(); expected whenever RLS hides a row, so it
 *  maps to null rather than an exception. */
const NO_ROWS = "PGRST116";

export function createSupabaseProjectRepositories(getClient: ClientFactory): {
  workspaces: WorkspaceRepository;
  projects: ProjectRepository;
} {
const supabaseWorkspaces: WorkspaceRepository = {
  async listForUser(userId: UserId): Promise<Workspace[]> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspaces(id, name, slug, created_at)")
      .eq("user_id", userId);
    if (error) throw new Error(`Failed to list workspaces: ${error.message}`);
    // supabase-js types an embedded relation as an array when it cannot infer
    // cardinality from the schema, so accept either shape rather than assert.
    return (data ?? [])
      .flatMap((row) => {
        const embedded = (row as unknown as {
          workspaces: WorkspaceRow | WorkspaceRow[] | null;
        }).workspaces;
        if (!embedded) return [];
        return Array.isArray(embedded) ? embedded : [embedded];
      })
      .map(toWorkspace);
  },

  async get(id: WorkspaceId): Promise<Workspace | null> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, slug, created_at")
      .eq("id", id)
      .single();
    if (error) {
      if (error.code === NO_ROWS) return null;
      throw new Error(`Failed to load workspace: ${error.message}`);
    }
    return toWorkspace(data as WorkspaceRow);
  },

  async membership(workspaceId: WorkspaceId, userId: UserId): Promise<WorkspaceMember | null> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id, user_id, role, joined_at")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to check membership: ${error.message}`);
    return data ? toMember(data as WorkspaceMemberRow) : null;
  },
};

const supabaseProjects: ProjectRepository = {
  async list(workspaceId: WorkspaceId): Promise<Project[]> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Failed to list projects: ${error.message}`);
    return (data as ProjectRow[]).map(toProject);
  },

  async get(id: ProjectId): Promise<Project | null> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("id", id)
      .single();
    if (error) {
      // RLS makes another user's project indistinguishable from a missing
      // one, which is the correct behaviour: no existence leak.
      if (error.code === NO_ROWS) return null;
      throw new Error(`Failed to load project: ${error.message}`);
    }
    return toProject(data as ProjectRow);
  },

  async create(input: CreateProjectInput, ownerId: UserId): Promise<Project> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        workspace_id: input.workspaceId,
        owner_id: ownerId,
        name: input.name,
        description: input.description ?? null,
      })
      .select(PROJECT_COLUMNS)
      .single();
    if (error) throw new Error(`Failed to create project: ${error.message}`);
    return toProject(data as ProjectRow);
  },

  async update(id: ProjectId, patch: UpdateProjectInput): Promise<Project> {
    const supabase = await getClient();
    const values: Record<string, unknown> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    // The generation pipeline patches these two. Omitting them left an empty
    // PATCH body, which updates zero rows — so `.single()` failed with "Cannot
    // coerce the result to a single JSON object". The demo adapter mapped all
    // four fields, so the whole pipeline worked against the file store and
    // broke on the first real Supabase generation. A whitelist that silently
    // drops fields is the same trap as the run adapters' `validation`.
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.currentRevisionId !== undefined) {
      values.current_revision_id = patch.currentRevisionId;
    }
    const { data, error } = await supabase
      .from("projects")
      .update(values)
      .eq("id", id)
      .select(PROJECT_COLUMNS)
      .single();
    if (error) throw new Error(`Failed to update project: ${error.message}`);
    return toProject(data as ProjectRow);
  },

  async delete(id: ProjectId): Promise<void> {
    const supabase = await getClient();
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  },
};

  return { workspaces: supabaseWorkspaces, projects: supabaseProjects };
}

/** For a request: the cookie client, so Row Level Security applies with the
 *  caller's own identity. */
const requestScoped = createSupabaseProjectRepositories(getSupabaseServerClient);

export const supabaseWorkspaces = requestScoped.workspaces;
export const supabaseProjects = requestScoped.projects;

/** For run execution: the service role, because it has no session.
 *
 * Same confinement as `workerRepositories` in `builder.ts` — reachable only
 * from the worker container, never from a route that renders for a user. */
export const workerProjectRepositories = createSupabaseProjectRepositories(async () =>
  getSupabaseAdminClient()
);
