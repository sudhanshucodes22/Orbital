/** Ports — the contract a backend must satisfy.
 *
 * Services depend on these interfaces and never on a vendor SDK, so swapping
 * Supabase for anything else is an adapter change in lib/server rather than a
 * rewrite of the business logic. Nothing in this directory imports a runtime.
 */
import type {
  CreateProjectInput,
  CreateRevisionInput,
  CreateRunInput,
  FileSnapshot,
  GenerationIntent,
  GenerationJob,
  GenerationId,
  GenerationRun,
  RunPage,
  RunQuery,
  InputArtifact,
  InputKind,
  PreviewSession,
  Project,
  ProjectFile,
  ProjectId,
  Revision,
  RevisionId,
  Session,
  UpdateProjectInput,
  User,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceMember,
} from "../domain";

/** Discriminated so callers handle failure explicitly instead of catching. */
export type AuthResult =
  | { ok: true; needsConfirmation?: boolean }
  | { ok: false; message: string };

export interface AuthPort {
  /** The current session, or null when signed out. Never throws for the
   *  signed-out case — that is a normal state, not an error. */
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResult>;
  signOut(): Promise<void>;
}

export interface WorkspaceRepository {
  listForUser(userId: UserId): Promise<Workspace[]>;
  get(id: WorkspaceId): Promise<Workspace | null>;
  membership(workspaceId: WorkspaceId, userId: UserId): Promise<WorkspaceMember | null>;
}

export interface ProjectRepository {
  list(workspaceId: WorkspaceId): Promise<Project[]>;
  get(id: ProjectId): Promise<Project | null>;
  create(input: CreateProjectInput, ownerId: UserId): Promise<Project>;
  update(id: ProjectId, patch: UpdateProjectInput): Promise<Project>;
  delete(id: ProjectId): Promise<void>;
}

export interface RevisionRepository {
  listForProject(projectId: ProjectId): Promise<Revision[]>;
  get(id: RevisionId): Promise<Revision | null>;
  /** Cuts a revision. Append-only: a revision is never edited once written,
   *  which is what makes "nothing is overwritten" true rather than aspirational. */
  create(input: CreateRevisionInput): Promise<Revision>;
}

/** The project's working tree.
 *
 * Writes go through `applyBatch` rather than a per-file `put`, because a
 * generation's operations must land together or not at all — a half-applied
 * change leaves a project that does not build and a history that does not
 * explain why. Adapters are expected to make the batch atomic.
 */
export interface ProjectFileRepository {
  list(projectId: ProjectId): Promise<ProjectFile[]>;
  get(projectId: ProjectId, path: string): Promise<ProjectFile | null>;
  /** Writes and deletes in one atomic step. Paths in `deletes` are removed;
   *  entries in `writes` are inserted or replaced by path. */
  applyBatch(
    projectId: ProjectId,
    writes: readonly FileSnapshot[],
    deletes: readonly string[]
  ): Promise<void>;
  /** Replaces the whole tree. Used by rollback, which is a restore rather than
   *  a sequence of edits. */
  replaceAll(projectId: ProjectId, files: readonly FileSnapshot[]): Promise<void>;
}

/** Generation runs — the audit trail. Append-mostly: a run is created, then
 *  patched as it progresses, and never deleted while its project lives. */
export interface RunRepository {
  create(input: CreateRunInput): Promise<GenerationRun>;
  get(id: string): Promise<GenerationRun | null>;
  /** By the generation job id the UI polls with. */
  getByGenerationId(generationId: GenerationId): Promise<GenerationRun | null>;
  /** History: paginated, filterable, newest first.
   *
   * The only read path for a list of runs. An unpaginated `listForProject`
   * used to sit beside this; it was removed rather than kept for convenience,
   * because a second way to read history is a second place for the page cap to
   * be wrong. */
  query(query: RunQuery): Promise<RunPage>;
  update(id: string, patch: Partial<GenerationRun>): Promise<GenerationRun>;

  /** The run currently occupying this project, if any.
   *
   * Backs the one-active-generation-per-project rule. A run whose lease has
   * expired does not count as active — the process holding it is gone. */
  findActive(projectId: ProjectId): Promise<GenerationRun | null>;

  /** An earlier run for the same request, if one exists.
   *
   * Idempotency: a double submit returns the original run rather than starting
   * a second one and cutting a second revision. */
  findByIdempotencyKey(projectId: ProjectId, key: string): Promise<GenerationRun | null>;

  /** Takes ownership of a run for `leaseMs`, atomically.
   *
   * Returns the claimed run, or null when someone else holds a live lease.
   * This is the whole concurrency mechanism: it must be atomic in the adapter,
   * because two requests calling it at the same instant is the normal case,
   * not the edge case. */
  claim(runId: string, leaseMs: number): Promise<GenerationRun | null>;

  /** Runs a worker could pick up: queued, or running with an expired lease.
   *
   * Across all projects, oldest first — this is the worker's inbox, and it is
   * the reason a queued run does not need the submitting request to survive.
   * Returns candidates only; `claim` is what actually decides who gets one. */
  listClaimable(limit: number): Promise<GenerationRun[]>;
}

export interface ArtifactStorage {
  /** Returns a short-lived URL the browser can PUT to, so large uploads never
   *  pass through the application server. */
  createUploadUrl(args: {
    kind: Exclude<InputKind, "text">;
    mimeType: string;
    byteSize: number;
  }): Promise<{ uploadUrl: string; storageKey: string }>;
  createReadUrl(storageKey: string, ttlSeconds?: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
}

export interface GenerationEngine {
  submit(projectId: ProjectId, intent: GenerationIntent): Promise<GenerationJob>;
  get(id: GenerationId): Promise<GenerationJob | null>;
  cancel(id: GenerationId): Promise<void>;
}

/** Somewhere a revision's files can actually run.
 *
 * The contract deliberately says nothing about *how*. The local
 * implementation materialises files into an isolated directory and serves them
 * from a real HTTP server on an allocated port; a future one might start a
 * container, or call a cloud sandbox API. The Builder Workspace consumes only
 * this, so replacing the runtime is an adapter swap rather than a UI change.
 *
 * Every method is keyed by project, because a project has at most one preview.
 * Two previews of the same project serving different revisions is a way to
 * look at the wrong thing without knowing it.
 *
 * Implementations own their own resources — ports, directories, processes —
 * and are responsible for reaping idle sessions. Nothing above this interface
 * knows a port number exists.
 */
export interface PreviewRuntime {
  /** Starts (or re-targets) the preview for a project at a revision.
   *
   * Idempotent for the same revision: calling it while a preview of that
   * revision is already running returns the running session rather than
   * restarting it, so a workspace that opens twice does not cycle the server.
   * A *different* revision is a restart. */
  start(projectId: ProjectId, revisionId: RevisionId): Promise<PreviewSession>;

  /** The current session, or null when nothing is running.
   *
   * Also the keep-alive: reading status refreshes the idle deadline, so an
   * open workspace holds its preview simply by polling. */
  status(projectId: ProjectId): Promise<PreviewSession | null>;

  /** Tears the preview down and frees its port and directory. Safe to call
   *  when nothing is running. */
  stop(projectId: ProjectId): Promise<void>;

  /** Stop and start again at the same revision. For a preview that crashed,
   *  or one a person does not trust. */
  restart(projectId: ProjectId): Promise<PreviewSession>;
}

export interface SitePublisher {
  /** Deploy a revision to a host. Returns the live URL. */
  publish(revisionId: RevisionId): Promise<{ url: string }>;
}

/** Everything the application needs from the outside world, in one place.
 *  A page or service asks the container for a port; it never constructs one. */
export interface ServiceContainer {
  auth: AuthPort;
  workspaces: WorkspaceRepository;
  projects: ProjectRepository;
  revisions: RevisionRepository;
  files: ProjectFileRepository;
  runs: RunRepository;
  storage: ArtifactStorage;
  generation: GenerationEngine;
  preview: PreviewRuntime;
  publisher: SitePublisher;
}

export type { InputArtifact, User };
