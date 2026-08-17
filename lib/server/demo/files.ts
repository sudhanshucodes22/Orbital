/** ProjectFileRepository and RunRepository for demo mode. SERVER ONLY.
 *
 * Backed by the same file-backed store as everything else, so a working tree
 * survives a restart exactly as projects and revisions do. `mutate` holds the
 * promise mutex for the whole callback, which is what makes `applyBatch`
 * genuinely atomic here: no other request can observe a half-applied batch.
 */
import { randomUUID } from "node:crypto";
import {
  asGenerationId,
  asProjectId,
  asRevisionId,
  DEFAULT_RUN_PAGE_SIZE,
  MAX_RUN_PAGE_SIZE,
  type ApplyReport,
  type BuildPlan,
  type CreateRunInput,
  type FileSnapshot,
  type GenerationEvent,
  type GenerationIntent,
  type GenerationMode,
  type GenerationRun,
  type GenerationId,
  type RunFailure,
  type GenerationStatus,
  type FileOperation,
  type ProjectFile,
  type ProjectId,
  type RunModelInfo,
  type RunPage,
  type RunQuery,
} from "../../domain";
import { ConflictError, NotFoundError } from "../../errors";
import type { ProjectFileRepository, RunRepository } from "../../ports";
import { mutate, nowIso, read, type DemoFile, type DemoRun } from "./store";

/** Terminal states, as raw strings — the store keeps status untyped so an
 *  added state does not need a store migration. */
const TERMINAL: readonly string[] = ["succeeded", "failed", "cancelled"];

function toFile(row: DemoFile): ProjectFile {
  return {
    projectId: asProjectId(row.projectId),
    path: row.path,
    kind: row.kind,
    content: row.content,
    storageKey: row.storageKey,
    hash: row.hash,
    byteSize: row.byteSize,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRun(row: DemoRun): GenerationRun {
  return {
    id: row.id,
    projectId: asProjectId(row.projectId),
    generationId: row.generationId ? asGenerationId(row.generationId) : null,
    prompt: row.prompt,
    baseRevisionId: row.baseRevisionId ? asRevisionId(row.baseRevisionId) : null,
    producedRevisionId: row.producedRevisionId ? asRevisionId(row.producedRevisionId) : null,
    intent: row.intent as GenerationIntent,
    idempotencyKey: row.idempotencyKey ?? null,
    retryOfRunId: row.retryOfRunId ?? null,
    // Rows written before retries existed were all first attempts.
    attempt: row.attempt ?? 1,
    startedAt: row.startedAt ?? null,
    leaseExpiresAt: row.leaseExpiresAt ?? null,
    failure: (row.failure as RunFailure | null) ?? null,
    status: row.status as GenerationStatus,
    // Rows written before runs recorded a mode are demo rows by definition:
    // no model path existed when they were created.
    mode: (row.mode as GenerationMode | undefined) ?? "demo",
    plan: (row.plan as BuildPlan | null) ?? null,
    operations: (row.operations as FileOperation[] | null) ?? [],
    report: (row.report as ApplyReport | null) ?? null,
    model: (row.model as RunModelInfo | null) ?? null,
    events: row.events as GenerationEvent[],
    error: row.error,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export const demoFiles: ProjectFileRepository = {
  async list(projectId: ProjectId): Promise<ProjectFile[]> {
    return read((db) =>
      db.files
        .filter((f) => f.projectId === projectId)
        .sort((a, b) => a.path.localeCompare(b.path))
        .map(toFile)
    );
  },

  async get(projectId: ProjectId, path: string): Promise<ProjectFile | null> {
    return read((db) => {
      const row = db.files.find((f) => f.projectId === projectId && f.path === path);
      return row ? toFile(row) : null;
    });
  },

  async applyBatch(
    projectId: ProjectId,
    writes: readonly FileSnapshot[],
    deletes: readonly string[]
  ): Promise<void> {
    await mutate((db) => {
      const removing = new Set(deletes);
      if (removing.size > 0) {
        db.files = db.files.filter(
          (f) => !(f.projectId === projectId && removing.has(f.path))
        );
      }
      for (const snapshot of writes) {
        const existing = db.files.find(
          (f) => f.projectId === projectId && f.path === snapshot.path
        );
        if (existing) {
          existing.kind = snapshot.kind;
          existing.content = snapshot.content;
          existing.storageKey = snapshot.storageKey;
          existing.hash = snapshot.hash;
          existing.byteSize = snapshot.byteSize;
          existing.updatedAt = nowIso();
        } else {
          db.files.push({
            projectId,
            path: snapshot.path,
            kind: snapshot.kind,
            content: snapshot.content,
            storageKey: snapshot.storageKey,
            hash: snapshot.hash,
            byteSize: snapshot.byteSize,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
      }
    });
  },

  async replaceAll(projectId: ProjectId, files: readonly FileSnapshot[]): Promise<void> {
    await mutate((db) => {
      db.files = db.files.filter((f) => f.projectId !== projectId);
      for (const snapshot of files) {
        db.files.push({
          projectId,
          path: snapshot.path,
          kind: snapshot.kind,
          content: snapshot.content,
          storageKey: snapshot.storageKey,
          hash: snapshot.hash,
          byteSize: snapshot.byteSize,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
    });
  },
};

export const demoRuns: RunRepository = {
  async create(input: CreateRunInput): Promise<GenerationRun> {
    return mutate((db) => {
      const now = Date.now();

      // Idempotency and the one-active-run rule are both decided here, inside
      // the store mutex, rather than by a read-then-write in the caller. Two
      // simultaneous submits serialise through `mutate`, so the second one
      // sees what the first just wrote — which is the same guarantee the
      // Supabase partial unique index gives.
      if (input.idempotencyKey) {
        const duplicate = db.runs.find(
          (r) => r.projectId === input.projectId && r.idempotencyKey === input.idempotencyKey
        );
        if (duplicate) return toRun(duplicate);
      }

      const active = db.runs.find(
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

      const row: DemoRun = {
        id: randomUUID(),
        projectId: input.projectId,
        generationId: input.generationId,
        prompt: input.prompt,
        baseRevisionId: input.baseRevisionId,
        producedRevisionId: null,
        status: "queued",
        mode: input.mode,
        intent: input.intent,
        idempotencyKey: input.idempotencyKey,
        retryOfRunId: input.retryOfRunId ?? null,
        attempt: input.attempt ?? 1,
        startedAt: null,
        leaseExpiresAt: null,
        failure: null,
        plan: null,
        operations: [],
        report: null,
        model: null,
        events: [{ at: nowIso(), status: "queued", message: "run created" }],
        error: null,
        createdAt: nowIso(),
        completedAt: null,
      };
      db.runs.push(row);
      return toRun(row);
    });
  },

  async get(id: string): Promise<GenerationRun | null> {
    return read((db) => {
      const row = db.runs.find((r) => r.id === id);
      return row ? toRun(row) : null;
    });
  },

  /** Keyset pagination over the in-memory rows.
   *
   * Fetches one row past the page so `hasMore` is answered by evidence rather
   * than by comparing the page length to the limit — which is wrong exactly
   * when the history size is a multiple of the page size, and therefore wrong
   * in the case someone notices. */
  async query(q: RunQuery): Promise<RunPage> {
    const limit = Math.min(
      Math.max(1, q.limit ?? DEFAULT_RUN_PAGE_SIZE),
      MAX_RUN_PAGE_SIZE
    );
    return read((db) => {
      const matched = db.runs
        .filter((r) => {
          if (q.projectId && r.projectId !== q.projectId) return false;
          if (q.statuses?.length && !q.statuses.includes(r.status as GenerationStatus)) {
            return false;
          }
          if (q.producedRevisionId && r.producedRevisionId !== q.producedRevisionId) {
            return false;
          }
          // Strictly older than the cursor: the cursor row was the last item
          // of the previous page and must not appear twice.
          if (q.cursor && !(r.createdAt < q.cursor)) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const page = matched.slice(0, limit);
      const hasMore = matched.length > limit;
      return {
        runs: page.map(toRun),
        nextCursor: hasMore && page.length > 0 ? page[page.length - 1].createdAt : null,
        hasMore,
      };
    });
  },

  async listClaimable(limit: number): Promise<GenerationRun[]> {
    return read((db) => {
      const now = Date.now();
      return db.runs
        .filter(
          (r) =>
            !TERMINAL.includes(r.status) &&
            // Queued, or abandoned by a worker whose lease ran out.
            (!r.leaseExpiresAt || Date.parse(r.leaseExpiresAt) < now)
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit)
        .map(toRun);
    });
  },

  async getByGenerationId(generationId: GenerationId): Promise<GenerationRun | null> {
    return read((db) => {
      const row = db.runs.find((r) => r.generationId === generationId);
      return row ? toRun(row) : null;
    });
  },

  async findActive(projectId: ProjectId): Promise<GenerationRun | null> {
    return read((db) => {
      const now = Date.now();
      const row = db.runs.find(
        (r) =>
          r.projectId === projectId &&
          !TERMINAL.includes(r.status) &&
          // An expired lease means the worker died; the run is stale, not
          // active, and must not block a new generation forever.
          !(r.leaseExpiresAt && Date.parse(r.leaseExpiresAt) < now)
      );
      return row ? toRun(row) : null;
    });
  },

  async findByIdempotencyKey(projectId: ProjectId, key: string): Promise<GenerationRun | null> {
    return read((db) => {
      const row = db.runs.find((r) => r.projectId === projectId && r.idempotencyKey === key);
      return row ? toRun(row) : null;
    });
  },

  /** Atomic because `mutate` holds the store mutex for the whole callback: no
   *  other request can observe or take the lease mid-decision. */
  async claim(runId: string, leaseMs: number): Promise<GenerationRun | null> {
    return mutate((db) => {
      const row = db.runs.find((r) => r.id === runId);
      if (!row) return null;
      if (TERMINAL.includes(row.status)) return null;

      const now = Date.now();
      const held = row.leaseExpiresAt ? Date.parse(row.leaseExpiresAt) : 0;
      if (held > now) return null; // someone else is working on it

      row.status = "running";
      row.startedAt = row.startedAt ?? nowIso();
      row.leaseExpiresAt = new Date(now + leaseMs).toISOString();
      return toRun(row);
    });
  },

  async update(id: string, patch: Partial<GenerationRun>): Promise<GenerationRun> {
    return mutate((db) => {
      const row = db.runs.find((r) => r.id === id);
      if (!row) throw new NotFoundError("Run");

      if (patch.status !== undefined) row.status = patch.status;
      if (patch.plan !== undefined) row.plan = patch.plan;
      if (patch.operations !== undefined) row.operations = patch.operations;
      if (patch.report !== undefined) row.report = patch.report;
      if (patch.model !== undefined) row.model = patch.model;
      if (patch.error !== undefined) row.error = patch.error;
      if (patch.failure !== undefined) row.failure = patch.failure;
      if (patch.startedAt !== undefined) row.startedAt = patch.startedAt;
      if (patch.leaseExpiresAt !== undefined) row.leaseExpiresAt = patch.leaseExpiresAt;
      if (patch.completedAt !== undefined) row.completedAt = patch.completedAt;
      if (patch.producedRevisionId !== undefined) {
        row.producedRevisionId = patch.producedRevisionId;
      }
      // Events append rather than replace: a run's event list is a log, and a
      // patch that shortened it would be losing history, not updating it.
      if (patch.events !== undefined) {
        for (const e of patch.events) {
          if (!row.events.some((x) => x.status === e.status && x.message === e.message)) {
            row.events.push({ at: e.at, status: e.status, message: e.message });
          }
        }
      }
      return toRun(row);
    });
  },
};
