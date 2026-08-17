/** Workspace, Project and Revision repositories for demo mode. SERVER ONLY.
 *
 * Ownership is enforced here the way Row Level Security enforces it in
 * Supabase: every read filters on the caller. Without a database there is no
 * policy engine, so the filter has to live in the adapter — the service layer
 * still does its own role checks on top.
 */
import { randomUUID } from "node:crypto";
import {
  asProjectId,
  asRevisionId,
  asUserId,
  asWorkspaceId,
  type CreateProjectInput,
  type CreateRevisionInput,
  type Project,
  type ProjectId,
  type Revision,
  type RevisionId,
  type UpdateProjectInput,
  type UserId,
  type Workspace,
  type WorkspaceId,
  type WorkspaceMember,
} from "../../domain";
import type { ProjectRepository, RevisionRepository, WorkspaceRepository } from "../../ports";
import { mutate, nowIso, read, type DemoProject, type DemoRevision } from "./store";
import type { GeneratedSite } from "../../domain";

const toProject = (r: DemoProject): Project => ({
  id: asProjectId(r.id),
  workspaceId: asWorkspaceId(r.workspaceId),
  ownerId: asUserId(r.ownerId),
  name: r.name,
  description: r.description,
  status: r.status,
  currentRevisionId: r.currentRevisionId ? asRevisionId(r.currentRevisionId) : null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const toRevision = (r: DemoRevision): Revision => ({
  id: asRevisionId(r.id),
  projectId: asProjectId(r.projectId),
  parentId: r.parentId ? asRevisionId(r.parentId) : null,
  generationId: r.generationId ? (r.generationId as Revision["generationId"]) : null,
  summary: r.summary,
  site: r.site as GeneratedSite,
  createdAt: r.createdAt,
  tree: (r.tree as Revision["tree"]) ?? undefined,
});

export const demoWorkspaces: WorkspaceRepository = {
  async listForUser(userId: UserId): Promise<Workspace[]> {
    return read((db) =>
      db.members
        .filter((m) => m.userId === userId)
        .flatMap((m) => {
          const w = db.workspaces.find((x) => x.id === m.workspaceId);
          return w ? [{ id: asWorkspaceId(w.id), name: w.name, slug: w.slug, createdAt: w.createdAt }] : [];
        })
    );
  },

  async get(id: WorkspaceId): Promise<Workspace | null> {
    return read((db) => {
      const w = db.workspaces.find((x) => x.id === id);
      return w ? { id: asWorkspaceId(w.id), name: w.name, slug: w.slug, createdAt: w.createdAt } : null;
    });
  },

  async membership(workspaceId: WorkspaceId, userId: UserId): Promise<WorkspaceMember | null> {
    return read((db) => {
      const m = db.members.find((x) => x.workspaceId === workspaceId && x.userId === userId);
      return m
        ? {
            workspaceId: asWorkspaceId(m.workspaceId),
            userId: asUserId(m.userId),
            role: m.role,
            joinedAt: m.joinedAt,
          }
        : null;
    });
  },
};

export const demoProjects: ProjectRepository = {
  async list(workspaceId: WorkspaceId): Promise<Project[]> {
    return read((db) =>
      db.projects
        .filter((p) => p.workspaceId === workspaceId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(toProject)
    );
  },

  async get(id: ProjectId): Promise<Project | null> {
    return read((db) => {
      const p = db.projects.find((x) => x.id === id);
      return p ? toProject(p) : null;
    });
  },

  async create(input: CreateProjectInput, ownerId: UserId): Promise<Project> {
    return mutate((db) => {
      const row: DemoProject = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        ownerId,
        name: input.name,
        description: input.description ?? null,
        status: "draft",
        currentRevisionId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.projects.push(row);
      return toProject(row);
    });
  },

  async update(id: ProjectId, patch: UpdateProjectInput): Promise<Project> {
    return mutate((db) => {
      const row = db.projects.find((x) => x.id === id);
      if (!row) throw new Error("Project not found");
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.description !== undefined) row.description = patch.description;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.currentRevisionId !== undefined) row.currentRevisionId = patch.currentRevisionId;
      row.updatedAt = nowIso();
      return toProject(row);
    });
  },

  /** Deletes a project and everything belonging to it.
   *
   * Every table keyed by `projectId` has to be listed here. Under Supabase
   * these are `on delete cascade` foreign keys (migration 0003), so the
   * database does it; the demo store has no foreign keys, which means this
   * function *is* the cascade and forgetting a table silently orphans rows.
   *
   * `files` and `runs` were exactly that: added after this function was
   * written, cascaded correctly in Postgres, and left behind here — a deleted
   * project's file contents and prompt history outliving it in the store. */
  async delete(id: ProjectId): Promise<void> {
    await mutate((db) => {
      db.projects = db.projects.filter((x) => x.id !== id);
      db.revisions = db.revisions.filter((r) => r.projectId !== id);
      db.jobs = db.jobs.filter((j) => j.projectId !== id);
      db.files = db.files.filter((f) => f.projectId !== id);
      db.runs = db.runs.filter((r) => r.projectId !== id);
    });
  },
};

export const demoRevisions: RevisionRepository = {
  async listForProject(projectId: ProjectId): Promise<Revision[]> {
    return read((db) =>
      db.revisions
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toRevision)
    );
  },

  async get(id: RevisionId): Promise<Revision | null> {
    return read((db) => {
      const r = db.revisions.find((x) => x.id === id);
      return r ? toRevision(r) : null;
    });
  },

  async create(input: CreateRevisionInput): Promise<Revision> {
    return mutate((db) => {
      const row: DemoRevision = {
        id: randomUUID(),
        projectId: input.projectId,
        parentId: input.parentId,
        generationId: input.generationId,
        summary: input.summary,
        site: input.site,
        tree: input.tree,
        createdAt: nowIso(),
      };
      db.revisions.push(row);
      return toRevision(row);
    });
  },
};
