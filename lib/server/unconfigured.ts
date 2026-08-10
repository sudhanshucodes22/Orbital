/** Adapters for capabilities that have no backend yet.
 *
 * Every method throws NotConfiguredError naming the capability and the
 * environment variables that would enable it. Nothing here returns invented
 * data — a screen that renders is a screen that genuinely works.
 *
 * Replacing one of these is the whole job of the next phase: implement the
 * port in a sibling file, then swap it in lib/server/container.ts. No service
 * or page changes.
 */
import { CAPABILITY_REQUIREMENTS } from "../config/env";
import { NotConfiguredError } from "../errors";
import type {
  ArtifactStorage,
  AuthPort,
  GenerationEngine,
  ProjectRepository,
  RevisionRepository,
  SitePublisher,
  WorkspaceRepository,
} from "../ports";

const fail = (capability: keyof typeof CAPABILITY_REQUIREMENTS): never => {
  throw new NotConfiguredError(capability, CAPABILITY_REQUIREMENTS[capability]);
};

export const unconfiguredAuth: AuthPort = {
  // Signed-out is a legitimate state, not a failure, so this resolves to null
  // rather than throwing. It lets the product routes redirect to sign-in
  // exactly as they will once auth is real.
  async getSession() {
    return null;
  },
  async signIn() {
    return { ok: false as const, message: "Authentication is not configured." };
  },
  async signUp() {
    return { ok: false as const, message: "Authentication is not configured." };
  },
  async signOut() {
    return;
  },
};

export const unconfiguredWorkspaces: WorkspaceRepository = {
  async listForUser() { return fail("database"); },
  async get() { return fail("database"); },
  async membership() { return fail("database"); },
};

export const unconfiguredProjects: ProjectRepository = {
  async list() { return fail("database"); },
  async get() { return fail("database"); },
  async create() { return fail("database"); },
  async update() { return fail("database"); },
  async delete() { return fail("database"); },
};

export const unconfiguredRevisions: RevisionRepository = {
  async listForProject() { return fail("database"); },
  async get() { return fail("database"); },
};

export const unconfiguredStorage: ArtifactStorage = {
  async createUploadUrl() { return fail("storage"); },
  async createReadUrl() { return fail("storage"); },
  async delete() { return fail("storage"); },
};

export const unconfiguredGeneration: GenerationEngine = {
  async submit() { return fail("generation"); },
  async get() { return fail("generation"); },
  async cancel() { return fail("generation"); },
};

export const unconfiguredPublisher: SitePublisher = {
  async publish() { return fail("publishing"); },
};
