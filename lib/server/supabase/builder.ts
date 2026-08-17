/** ProjectFileRepository, RevisionRepository and RunRepository backed by
 *  Supabase. SERVER ONLY.
 *
 * Every query runs through the request-scoped cookie client, so Row Level
 * Security applies with the caller's identity. The policies added in 0003 are
 * all the same question — does the caller own the project this row belongs to?
 * — which means a caller cannot reach another user's files, revisions or runs
 * even if a service check were bypassed.
 */
import {
  asGenerationId,
  asProjectId,
  asRevisionId,
  DEFAULT_RUN_PAGE_SIZE,
  MAX_RUN_PAGE_SIZE,
  type ApplyReport,
  type BuildPlan,
  type CreateRevisionInput,
  type CreateRunInput,
  type FileOperation,
  type FileSnapshot,
  type GeneratedSite,
  type GenerationEvent,
  type GenerationId,
  type GenerationIntent,
  type GenerationMode,
  type GenerationRun,
  type GenerationStatus,
  type ProjectFile,
  type ProjectId,
  type Revision,
  type RevisionId,
  type RunFailure,
  type RunModelInfo,
  type ValidationResult,
  type RunPage,
  type RunQuery,
} from "../../domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NotFoundError, ConflictError } from "../../errors";
import type {
  ProjectFileRepository,
  RevisionRepository,
  RunRepository,
} from "../../ports";
import { getSupabaseAdminClient, getSupabaseServerClient } from "./client";

/** How a repository set gets its client.
 *
 * Two callers with different identities: a request, which uses the cookie
 * client so Row Level Security applies with the caller's own identity, and the
 * worker, which has no session at all and uses the service role. Making this a
 * parameter is what lets one implementation serve both without the worker
 * needing to impersonate anybody. */
export type ClientFactory = () => Promise<SupabaseClient>;

const NO_ROWS = "PGRST116";
/** Unique violation. Raised by the idempotency index when two submits race. */
const UNIQUE_VIOLATION = "23505";

/* ----------------------------------------------------------- rows ------- */

interface FileRow {
  project_id: string;
  path: string;
  kind: string;
  content: string | null;
  storage_key: string | null;
  hash: string;
  byte_size: number;
  created_at: string;
  updated_at: string;
}

interface RevisionRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  generation_id: string | null;
  summary: string;
  site: unknown;
  tree: unknown;
  created_at: string;
}

interface RunRow {
  id: string;
  project_id: string;
  generation_id: string | null;
  prompt: string;
  intent: unknown;
  mode: string;
  idempotency_key: string | null;
  retry_of_run_id: string | null;
  attempt: number | null;
  base_revision_id: string | null;
  produced_revision_id: string | null;
  status: string;
  started_at: string | null;
  lease_expires_at: string | null;
  failure: unknown;
  plan: unknown;
  operations: unknown;
  report: unknown;
  validation: unknown;
  model: unknown;
  events: unknown;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

const FILE_COLUMNS =
  "project_id, path, kind, content, storage_key, hash, byte_size, created_at, updated_at";
const REVISION_COLUMNS =
  "id, project_id, parent_id, generation_id, summary, site, tree, created_at";
/* Deliberately one literal, not a concatenation: supabase-js reads the select
 * list at the type level, and `"a" + "b"` widens it to `string`, which loses
 * the row typing and lands you with GenericStringError. */
const RUN_COLUMNS =
  "id, project_id, generation_id, prompt, intent, mode, idempotency_key, retry_of_run_id, attempt, base_revision_id, produced_revision_id, status, started_at, lease_expires_at, failure, plan, operations, report, validation, model, events, error, created_at, completed_at";

const toFile = (r: FileRow): ProjectFile => ({
  projectId: asProjectId(r.project_id),
  path: r.path,
  kind: r.kind === "binary" ? "binary" : "text",
  content: r.content,
  storageKey: r.storage_key,
  hash: r.hash,
  byteSize: r.byte_size,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRevision = (r: RevisionRow): Revision => ({
  id: asRevisionId(r.id),
  projectId: asProjectId(r.project_id),
  parentId: r.parent_id ? asRevisionId(r.parent_id) : null,
  generationId: r.generation_id ? asGenerationId(r.generation_id) : null,
  summary: r.summary,
  site: r.site as GeneratedSite,
  // An empty array is a legitimately empty tree; absent is "cannot restore".
  tree: Array.isArray(r.tree) ? (r.tree as FileSnapshot[]) : undefined,
  createdAt: r.created_at,
});

const toRun = (r: RunRow): GenerationRun => ({
  id: r.id,
  projectId: asProjectId(r.project_id),
  generationId: r.generation_id ? asGenerationId(r.generation_id) : null,
  prompt: r.prompt,
  intent: r.intent as GenerationIntent,
  mode: (r.mode === "model" ? "model" : "demo") as GenerationMode,
  idempotencyKey: r.idempotency_key,
  retryOfRunId: r.retry_of_run_id,
  // Rows written before migration 0006 were all first attempts.
  attempt: r.attempt ?? 1,
  baseRevisionId: r.base_revision_id ? asRevisionId(r.base_revision_id) : null,
  producedRevisionId: r.produced_revision_id ? asRevisionId(r.produced_revision_id) : null,
  status: r.status as GenerationStatus,
  startedAt: r.started_at,
  leaseExpiresAt: r.lease_expires_at,
  failure: (r.failure as RunFailure | null) ?? null,
  plan: (r.plan as BuildPlan | null) ?? null,
  operations: (r.operations as FileOperation[] | null) ?? [],
  report: (r.report as ApplyReport | null) ?? null,
  validation: (r.validation as ValidationResult | null) ?? null,
  model: (r.model as RunModelInfo | null) ?? null,
  events: (r.events as GenerationEvent[] | null) ?? [],
  error: r.error,
  createdAt: r.created_at,
  completedAt: r.completed_at,
});

/* --------------------------------------------------------- files -------- */

export function createSupabaseBuilderRepositories(getClient: ClientFactory): {
  files: ProjectFileRepository;
  revisions: RevisionRepository;
  runs: RunRepository;
} {
const supabaseFiles: ProjectFileRepository = {
  async list(projectId: ProjectId): Promise<ProjectFile[]> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("project_files")
      .select(FILE_COLUMNS)
      .eq("project_id", projectId)
      .order("path", { ascending: true });
    if (error) throw new Error(`Failed to list files: ${error.message}`);
    return (data as FileRow[]).map(toFile);
  },

  async get(projectId: ProjectId, path: string): Promise<ProjectFile | null> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("project_files")
      .select(FILE_COLUMNS)
      .eq("project_id", projectId)
      .eq("path", path)
      .maybeSingle();
    if (error) throw new Error(`Failed to load file: ${error.message}`);
    return data ? toFile(data as FileRow) : null;
  },

  async applyBatch(
    projectId: ProjectId,
    writes: readonly FileSnapshot[],
    deletes: readonly string[]
  ): Promise<void> {
    const supabase = await getClient();

    if (deletes.length > 0) {
      const { error } = await supabase
        .from("project_files")
        .delete()
        .eq("project_id", projectId)
        .in("path", [...deletes]);
      if (error) throw new Error(`Failed to delete files: ${error.message}`);
    }

    if (writes.length > 0) {
      const { error } = await supabase.from("project_files").upsert(
        writes.map((w) => ({
          project_id: projectId,
          path: w.path,
          kind: w.kind,
          content: w.content,
          storage_key: w.storageKey,
          hash: w.hash,
          byte_size: w.byteSize,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "project_id,path" }
      );
      if (error) throw new Error(`Failed to write files: ${error.message}`);
    }
  },

  async replaceAll(projectId: ProjectId, files: readonly FileSnapshot[]): Promise<void> {
    const supabase = await getClient();
    const { error: wipe } = await supabase
      .from("project_files")
      .delete()
      .eq("project_id", projectId);
    if (wipe) throw new Error(`Failed to clear files: ${wipe.message}`);
    if (files.length === 0) return;
    await supabaseFiles.applyBatch(projectId, files, []);
  },
};

/* ------------------------------------------------------ revisions ------- */

const supabaseRevisions: RevisionRepository = {
  async listForProject(projectId: ProjectId): Promise<Revision[]> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("project_revisions")
      .select(REVISION_COLUMNS)
      .eq("project_id", projectId)
      // Newest first, matching every other list in the product.
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list revisions: ${error.message}`);
    return (data as RevisionRow[]).map(toRevision);
  },

  async get(id: RevisionId): Promise<Revision | null> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("project_revisions")
      .select(REVISION_COLUMNS)
      .eq("id", id)
      .single();
    if (error) {
      if (error.code === NO_ROWS) return null;
      throw new Error(`Failed to load revision: ${error.message}`);
    }
    return toRevision(data as RevisionRow);
  },

  async create(input: CreateRevisionInput): Promise<Revision> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("project_revisions")
      .insert({
        project_id: input.projectId,
        parent_id: input.parentId,
        generation_id: input.generationId,
        summary: input.summary,
        site: input.site,
        tree: input.tree,
      })
      .select(REVISION_COLUMNS)
      .single();
    if (error) throw new Error(`Failed to create revision: ${error.message}`);
    return toRevision(data as RevisionRow);
  },
};

/* ----------------------------------------------------------- runs ------- */

const supabaseRuns: RunRepository = {
  async create(input: CreateRunInput): Promise<GenerationRun> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("generation_runs")
      .insert({
        project_id: input.projectId,
        generation_id: input.generationId,
        prompt: input.prompt,
        intent: input.intent,
        mode: input.mode,
        idempotency_key: input.idempotencyKey,
        retry_of_run_id: input.retryOfRunId ?? null,
        attempt: input.attempt ?? 1,
        base_revision_id: input.baseRevisionId,
        status: "queued",
        events: [],
        operations: [],
      })
      .select(RUN_COLUMNS)
      .single();

    if (error) {
      // Two indexes can raise this, and they mean opposite things.
      if (error.code === UNIQUE_VIOLATION) {
        // Same request twice: the first run is the right answer for both, so
        // return it. That is what idempotency means here.
        if (input.idempotencyKey) {
          const existing = await supabaseRuns.findByIdempotencyKey(
            input.projectId,
            input.idempotencyKey
          );
          if (existing) return existing;
        }
        // Different request, project already busy: the one-active-per-project
        // index refused it. Enforced by the database rather than by a read
        // beforehand, so it holds even when two submits arrive together.
        throw new ConflictError(
          "This project already has a generation in progress. Wait for it to finish."
        );
      }
      throw new Error(`Failed to create run: ${error.message}`);
    }
    return toRun(data as RunRow);
  },

  async get(id: string): Promise<GenerationRun | null> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("generation_runs")
      .select(RUN_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Failed to load run: ${error.message}`);
    return data ? toRun(data as RunRow) : null;
  },

  async getByGenerationId(generationId: GenerationId): Promise<GenerationRun | null> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("generation_runs")
      .select(RUN_COLUMNS)
      .eq("generation_id", generationId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load run: ${error.message}`);
    return data ? toRun(data as RunRow) : null;
  },

  /** Keyset pagination, pushed into the database.
   *
   * The filters are all SQL, and migration 0006 adds the composite index
   * `(project_id, created_at desc)` the ordering needs — the point of a query
   * interface is that the database returns a page, not that the server
   * receives everything and slices it.
   *
   * RLS still applies: this runs under the caller's session, so a project_id
   * belonging to someone else returns nothing rather than returning rows. */
  async query(q: RunQuery): Promise<RunPage> {
    const limit = Math.min(
      Math.max(1, q.limit ?? DEFAULT_RUN_PAGE_SIZE),
      MAX_RUN_PAGE_SIZE
    );
    const supabase = await getClient();
    let builder = supabase
      .from("generation_runs")
      .select(RUN_COLUMNS)
      .order("created_at", { ascending: false })
      // One past the page, so `hasMore` is observed rather than inferred.
      .limit(limit + 1);

    if (q.projectId) builder = builder.eq("project_id", q.projectId);
    if (q.statuses?.length) builder = builder.in("status", [...q.statuses]);
    if (q.producedRevisionId) {
      builder = builder.eq("produced_revision_id", q.producedRevisionId);
    }
    // Strictly less than: the cursor row ended the previous page.
    if (q.cursor) builder = builder.lt("created_at", q.cursor);

    const { data, error } = await builder;
    if (error) throw new Error(`Failed to query runs: ${error.message}`);

    const rows = data as RunRow[];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).map(toRun);
    return {
      runs: page,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].createdAt : null,
      hasMore,
    };
  },

  async listClaimable(limit: number): Promise<GenerationRun[]> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("generation_runs")
      .select(RUN_COLUMNS)
      .not("status", "in", "(succeeded,failed,cancelled)")
      // Queued, or abandoned by a worker whose lease ran out. Recovery is not
      // a separate mechanism — a stale lease simply makes the run claimable
      // again, and the next tick picks it up.
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Failed to list claimable runs: ${error.message}`);
    return (data as RunRow[]).map(toRun);
  },

  async update(id: string, patch: Partial<GenerationRun>): Promise<GenerationRun> {
    const supabase = await getClient();
    const values: Record<string, unknown> = {};
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.plan !== undefined) values.plan = patch.plan;
    if (patch.operations !== undefined) values.operations = patch.operations;
    if (patch.report !== undefined) values.report = patch.report;
    if (patch.validation !== undefined) values.validation = patch.validation;
    if (patch.model !== undefined) values.model = patch.model;
    if (patch.events !== undefined) values.events = patch.events;
    if (patch.error !== undefined) values.error = patch.error;
    if (patch.failure !== undefined) values.failure = patch.failure;
    if (patch.startedAt !== undefined) values.started_at = patch.startedAt;
    if (patch.leaseExpiresAt !== undefined) values.lease_expires_at = patch.leaseExpiresAt;
    if (patch.completedAt !== undefined) values.completed_at = patch.completedAt;
    if (patch.producedRevisionId !== undefined) {
      values.produced_revision_id = patch.producedRevisionId;
    }

    const { data, error } = await supabase
      .from("generation_runs")
      .update(values)
      .eq("id", id)
      .select(RUN_COLUMNS)
      .single();
    if (error) throw new Error(`Failed to update run: ${error.message}`);
    if (!data) throw new NotFoundError("Run");
    return toRun(data as RunRow);
  },

  async findActive(projectId: ProjectId): Promise<GenerationRun | null> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("generation_runs")
      .select(RUN_COLUMNS)
      .eq("project_id", projectId)
      .not("status", "in", "(succeeded,failed,cancelled)")
      // An expired lease means the worker died; the run is stale, not active,
      // and must not block the project forever.
      .or(`lease_expires_at.is.null,lease_expires_at.gt.${new Date().toISOString()}`)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to check for an active run: ${error.message}`);
    return data ? toRun(data as RunRow) : null;
  },

  async findByIdempotencyKey(projectId: ProjectId, key: string): Promise<GenerationRun | null> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("generation_runs")
      .select(RUN_COLUMNS)
      .eq("project_id", projectId)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) throw new Error(`Failed to look up run: ${error.message}`);
    return data ? toRun(data as RunRow) : null;
  },

  /** Delegates to a single conditional UPDATE in Postgres.
   *
   * Doing this as select-then-update here would leave a window where two
   * workers both see a free lease and both take it. The database is the only
   * place that can decide this atomically, so it does. */
  async claim(runId: string, leaseMs: number): Promise<GenerationRun | null> {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("claim_generation_run", {
      p_run_id: runId,
      p_lease_ms: leaseMs,
    });
    if (error) throw new Error(`Failed to claim run: ${error.message}`);
    const rows = (data ?? []) as RunRow[];
    return rows.length > 0 ? toRun(rows[0]) : null;
  },
};

  return { files: supabaseFiles, revisions: supabaseRevisions, runs: supabaseRuns };
}

/** For a request: the cookie client, so Row Level Security applies with the
 *  caller's own identity. */
const requestScoped = createSupabaseBuilderRepositories(getSupabaseServerClient);

export const supabaseFiles = requestScoped.files;
export const supabaseRevisions = requestScoped.revisions;
export const supabaseRuns = requestScoped.runs;

/** For the worker: the service role, because a scheduler has no session.
 *
 * This bypasses Row Level Security, which is exactly why it is confined to the
 * worker path and never reachable from a route that renders for a user. The
 * worker only ever acts on runs it found in the queue, and every write it makes
 * is scoped to that run's own project. */
export const workerRepositories = createSupabaseBuilderRepositories(async () =>
  getSupabaseAdminClient()
);
