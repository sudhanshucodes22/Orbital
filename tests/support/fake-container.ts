/** An in-memory container for tests.
 *
 * Only the ports the pipeline touches are real; everything else throws, so an
 * accidental dependency shows up as a failure rather than as a silent pass.
 * The run repository implements the same lease semantics as the demo adapter,
 * because those semantics are what the concurrency and durability tests are
 * actually testing.
 */
import {
  asProjectId,
  asRevisionId,
  asUserId,
  asWorkspaceId,
  DEFAULT_RUN_PAGE_SIZE,
  MAX_RUN_PAGE_SIZE,
  type CreateRevisionInput,
  type CreateRunInput,
  type FileSnapshot,
  type GenerationId,
  type GenerationRun,
  type Project,
  type ProjectFile,
  type ProjectId,
  type PreviewSession,
  type Revision,
  type RevisionId,
  type UserId,
  type WorkspaceId,
  type RunPage,
  type RunQuery,
  type Session,
} from "../../lib/domain";
import { ConflictError } from "../../lib/errors";
import type { ServiceContainer } from "../../lib/ports";

export const PROJECT_ID = asProjectId("proj-1");
const TERMINAL = ["succeeded", "failed", "cancelled"];

export function ownerSession(): Session {
  return {
    user: {
      id: asUserId("user-1"),
      email: "owner@example.com",
      displayName: null,
      avatarUrl: null,
      createdAt: new Date().toISOString(),
    },
    activeWorkspaceId: asWorkspaceId("ws-1"),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

export interface FakeState {
  project: Project;
  files: ProjectFile[];
  revisions: Revision[];
  runs: GenerationRun[];
  /** Set to make the file store fail, for the database-failure test. */
  failWrites: boolean;
  /** The fake runtime's current session, if any. */
  preview: PreviewSession | null;
  /** Set to make the fake runtime report a startup failure. */
  previewFails: boolean;
  /** What the service asked the runtime to do, in order. Lets a test assert
   *  that a poll did not restart a healthy preview. */
  previewCalls: { call: string; revisionId: string | null }[];
}

export function fakeContainer(): { container: ServiceContainer; state: FakeState } {
  const state: FakeState = {
    project: {
      id: PROJECT_ID,
      workspaceId: asWorkspaceId("ws-1"),
      ownerId: asUserId("user-1"),
      name: "Beans",
      description: "A coffee shop",
      status: "draft",
      currentRevisionId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    files: [],
    revisions: [],
    runs: [],
    failWrites: false,
    preview: null,
    previewFails: false,
    previewCalls: [],
  };

  const unused = () => {
    throw new Error("port not expected in this test");
  };

  const container = {
    auth: { getSession: unused, signIn: unused, signUp: unused, signOut: unused },
    workspaces: {
      listForUser: unused,
      get: unused,
      /** Honest about who is asking.
       *
       * This used to return an owner membership unconditionally, which meant
       * every authorisation test passed regardless of what the services did.
       * A fake that grants access to anybody cannot test access control. */
      async membership(workspaceId: WorkspaceId, userId: UserId) {
        if (workspaceId !== state.project.workspaceId) return null;
        if (userId !== state.project.ownerId) return null;
        return {
          workspaceId: state.project.workspaceId,
          userId: state.project.ownerId,
          role: "owner" as const,
          joinedAt: new Date().toISOString(),
        };
      },
    },
    projects: {
      async list() { return [state.project]; },
      async get() { return state.project; },
      create: unused,
      async update(_id: unknown, patch: Record<string, unknown>) {
        state.project = { ...state.project, ...patch } as Project;
        return state.project;
      },
      delete: unused,
    },
    revisions: {
      async listForProject() { return state.revisions; },
      async get(id: string) { return state.revisions.find((r) => r.id === id) ?? null; },
      async create(input: CreateRevisionInput) {
        const revision = {
          id: asRevisionId(`rev-${state.revisions.length + 1}`),
          ...input,
          createdAt: new Date().toISOString(),
        } as unknown as Revision;
        state.revisions.push(revision);
        return revision;
      },
    },
    files: {
      async list() { return state.files; },
      async get(_p: unknown, path: string) {
        return state.files.find((f) => f.path === path) ?? null;
      },
      async applyBatch(
        _projectId: unknown,
        writes: readonly FileSnapshot[],
        deletes: readonly string[]
      ) {
        if (state.failWrites) throw new Error("disk on fire");
        const removing = new Set(deletes);
        state.files = state.files.filter((f) => !removing.has(f.path));
        for (const w of writes) {
          const now = new Date().toISOString();
          const row = { projectId: PROJECT_ID, ...w, createdAt: now, updatedAt: now } as ProjectFile;
          const i = state.files.findIndex((f) => f.path === w.path);
          if (i >= 0) state.files[i] = row;
          else state.files.push(row);
        }
      },
      async replaceAll(_projectId: unknown, files: readonly FileSnapshot[]) {
        if (state.failWrites) throw new Error("disk on fire");
        const now = new Date().toISOString();
        state.files = files.map(
          (f) => ({ projectId: PROJECT_ID, ...f, createdAt: now, updatedAt: now }) as ProjectFile
        );
      },
    },
    runs: {
      /** Mirrors the demo adapter and the Supabase unique index: idempotency
       *  and the one-active-run rule are decided *here*, at write time. The
       *  body runs to completion without awaiting, so two interleaved submits
       *  serialise the same way they do behind the store mutex or the
       *  database constraint. Modelling that is the point — a fake that only
       *  checked beforehand would pass tests the real thing would fail. */
      async create(input: CreateRunInput) {
        const now = Date.now();

        if (input.idempotencyKey) {
          const duplicate = state.runs.find(
            (r) => r.projectId === input.projectId && r.idempotencyKey === input.idempotencyKey
          );
          if (duplicate) return duplicate;
        }

        const active = state.runs.find(
          (r) =>
            r.projectId === input.projectId &&
            !TERMINAL.includes(r.status) &&
            !(r.leaseExpiresAt && Date.parse(r.leaseExpiresAt) < now)
        );
        if (active) {
          throw new ConflictError(
            "This project already has a generation in progress. Wait for it to finish."
          );
        }

        const run = {
          id: `run-${state.runs.length + 1}`,
          retryOfRunId: input.retryOfRunId ?? null,
          attempt: input.attempt ?? 1,
          ...input,
          producedRevisionId: null,
          status: "queued",
          startedAt: null,
          leaseExpiresAt: null,
          failure: null,
          plan: null,
          operations: [],
          report: null,
          validation: null,
          model: null,
          events: [],
          error: null,
          // Strictly increasing rather than `Date.now()`: several runs created
          // in the same millisecond would otherwise share a cursor value, and
          // keyset pagination would skip or repeat them. Real backends get
          // this from clock resolution plus row ordering; the fake has to be
          // explicit about it or it would hide paging bugs.
          createdAt: new Date(Date.now() + state.runs.length).toISOString(),
          completedAt: null,
        } as unknown as GenerationRun;
        state.runs.push(run);
        return run;
      },
      async get(id: string) { return state.runs.find((r) => r.id === id) ?? null; },
      async listClaimable(limit: number) {
        const now = Date.now();
        return state.runs
          .filter(
            (r) =>
              !TERMINAL.includes(r.status) &&
              !(r.leaseExpiresAt && Date.parse(r.leaseExpiresAt) > now)
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(0, limit);
      },
      async getByGenerationId(generationId: GenerationId) {
        return state.runs.find((r) => r.generationId === generationId) ?? null;
      },
      async query(q: RunQuery): Promise<RunPage> {
        const limit = Math.min(Math.max(1, q.limit ?? DEFAULT_RUN_PAGE_SIZE), MAX_RUN_PAGE_SIZE);
        const matched = state.runs
          .filter((r) => {
            if (q.projectId && r.projectId !== q.projectId) return false;
            if (q.statuses?.length && !q.statuses.includes(r.status)) return false;
            if (q.producedRevisionId && r.producedRevisionId !== q.producedRevisionId) return false;
            if (q.cursor && !(r.createdAt < q.cursor)) return false;
            return true;
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const page = matched.slice(0, limit);
        const hasMore = matched.length > limit;
        return {
          runs: page,
          nextCursor: hasMore && page.length > 0 ? page[page.length - 1].createdAt : null,
          hasMore,
        };
      },
      async update(id: string, patch: Partial<GenerationRun>) {
        const i = state.runs.findIndex((r) => r.id === id);
        state.runs[i] = { ...state.runs[i], ...patch };
        return state.runs[i];
      },
      async findActive(projectId: ProjectId) {
        const now = Date.now();
        return (
          state.runs.find(
            (r) =>
              r.projectId === projectId &&
              !TERMINAL.includes(r.status) &&
              !(r.leaseExpiresAt && Date.parse(r.leaseExpiresAt) < now)
          ) ?? null
        );
      },
      async findByIdempotencyKey(projectId: ProjectId, key: string) {
        return (
          state.runs.find((r) => r.projectId === projectId && r.idempotencyKey === key) ?? null
        );
      },
      async claim(runId: string, leaseMs: number) {
        const i = state.runs.findIndex((r) => r.id === runId);
        if (i < 0) return null;
        const run = state.runs[i];
        if (TERMINAL.includes(run.status)) return null;
        const now = Date.now();
        const held = run.leaseExpiresAt ? Date.parse(run.leaseExpiresAt) : 0;
        if (held > now) return null;
        state.runs[i] = {
          ...run,
          status: "running",
          startedAt: run.startedAt ?? new Date().toISOString(),
          leaseExpiresAt: new Date(now + leaseMs).toISOString(),
        };
        return state.runs[i];
      },
    },
    storage: { createUploadUrl: unused, createReadUrl: unused, delete: unused },
    generation: { submit: unused, get: unused, cancel: unused },
    /** A preview runtime that records what it was asked to do without
     *  starting a server.
     *
     * Service-level tests are about authorisation and revision selection, not
     * about sockets — the real runtime has its own tests that bind real ports.
     * It still models the parts the service depends on: `start` is idempotent
     * for the same revision, and `restart` bumps the version. */
    preview: {
      async start(projectId: ProjectId, revisionId: RevisionId) {
        state.previewCalls.push({ call: "start", revisionId });
        const same = state.preview && state.preview.revisionId === revisionId;
        state.preview = {
          projectId,
          revisionId,
          state: state.previewFails ? "failed" : "ready",
          origin: state.previewFails ? null : "http://127.0.0.1:41234",
          entries: state.previewFails
            ? []
            : [{ route: "/", path: "index.html", title: "Home" }],
          failure: state.previewFails
            ? { stage: "startup", message: "The preview could not be started.", detail: null }
            : null,
          startedAt: new Date().toISOString(),
          version: same ? (state.preview?.version ?? 1) : (state.preview?.version ?? 0) + 1,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          isolation: "sandboxed" as const,
        };
        return state.preview;
      },
      async status(projectId: ProjectId) {
        state.previewCalls.push({ call: "status", revisionId: null });
        return state.preview && state.preview.projectId === projectId ? state.preview : null;
      },
      async stop(projectId: ProjectId) {
        state.previewCalls.push({ call: "stop", revisionId: null });
        if (state.preview?.projectId === projectId) state.preview = null;
      },
      async restart() {
        state.previewCalls.push({ call: "restart", revisionId: null });
        if (!state.preview) throw new Error("nothing to restart");
        state.preview = { ...state.preview, version: state.preview.version + 1 };
        return state.preview;
      },
    },
    publisher: { publish: unused },
  } as unknown as ServiceContainer;

  return { container, state };
}
