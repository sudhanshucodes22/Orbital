/** Ports — the contract a backend must satisfy.
 *
 * Services depend on these interfaces and never on a vendor SDK, so swapping
 * Supabase for anything else is an adapter change in lib/server rather than a
 * rewrite of the business logic. Nothing in this directory imports a runtime.
 */
import type {
  CreateProjectInput,
  GenerationIntent,
  GenerationJob,
  GenerationId,
  InputArtifact,
  InputKind,
  Project,
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

export interface AuthPort {
  /** The current session, or null when signed out. Never throws for the
   *  signed-out case — that is a normal state, not an error. */
  getSession(): Promise<Session | null>;
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
  storage: ArtifactStorage;
  generation: GenerationEngine;
  publisher: SitePublisher;
}

export type { InputArtifact, User };
