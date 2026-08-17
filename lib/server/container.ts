/** Resolves the ports the application depends on.
 *
 * SERVER ONLY. Nothing under lib/server may be imported by a file carrying
 * "use client", directly or transitively.
 *
 * Two backends implement the same ports:
 *
 *   supabase  when SUPABASE_URL and SUPABASE_ANON_KEY are present
 *   demo      otherwise — a file-backed local backend, so a fresh clone runs
 *             end to end with no configuration
 *
 * Demo mode is the default rather than an opt-in flag, because a project that
 * only works after someone pastes credentials is a project that does not run.
 * Adding the Supabase variables switches every capability over; no other code
 * changes.
 */
import { backendMode, capabilities } from "../config/env";
import type { ServiceContainer } from "../ports";
import { hasModelProvider } from "./ai/registry";
import { modelGeneration, templateGeneration } from "./pipeline";
import {
  demoAuth,
  demoFiles,
  demoProjects,
  demoPublisher,
  demoRevisions,
  demoRuns,
  demoStorage,
} from "./demo";
import { supabaseAuth } from "./supabase/auth";
import { supabaseProjects, supabaseWorkspaces } from "./supabase/repositories";
import {
  supabaseFiles,
  supabaseRevisions,
  supabaseRuns,
  workerRepositories,
} from "./supabase/builder";
import { supabaseStorage } from "./supabase/storage";
import { demoWorkspaces } from "./demo/repositories";
import {
  __setPreviewLoader,
  __setPreviewTreeLoader,
  MaterializeError,
  previewRuntime,
} from "./preview";
import {
  unconfiguredGeneration,
  unconfiguredPublisher,
  unconfiguredStorage,
} from "./unconfigured";

let cached: ServiceContainer | null = null;

/** Teaches the preview runtime how to read a revision's frozen tree.
 *
 * Wired here rather than inside the preview module because that module is
 * imported *by* this one — doing it there would be a cycle. It reads through
 * `getContainer`, so it works against either backend and inherits Row Level
 * Security under Supabase.
 *
 * No authorisation happens here: `services/preview.ts` has already established
 * that the caller may see this project, and a second check would imply this is
 * an entry point when it is not. The revision-belongs-to-project check *is*
 * here, because that is data integrity rather than authorisation — serving one
 * project's revision under another's preview would be wrong even for a caller
 * who owned both.
 */
const loadRevisionTree = async (
  projectId: import("../domain").ProjectId,
  revisionId: import("../domain").RevisionId
) => {
  const revision = await getContainer().revisions.get(revisionId);

  if (!revision || revision.projectId !== projectId) {
    throw new MaterializeError({
      stage: "unknown",
      message: "That revision is no longer available to preview.",
      detail: null,
    });
  }

  if (!revision.tree) {
    // Revisions predating tree snapshots have no files to serve. Restore has
    // the same limitation and reports it the same way.
    throw new MaterializeError({
      stage: "unsupportedProject",
      message:
        "This revision predates file snapshots, so it cannot be previewed. Make a change to create one that can.",
      detail: null,
    });
  }

  return revision.tree;
};

// Both runtimes read trees the same way; whichever is selected gets the loader.
__setPreviewLoader(loadRevisionTree);
__setPreviewTreeLoader(loadRevisionTree);

/** Which engine answers a generation request.
 *
 * A configured provider always wins, in both backend modes. That ordering is
 * the rule: once someone has set GENERATION_PROVIDER / MODEL / API_KEY, a
 * failure must surface as a failure. Falling back to the template engine would
 * hand back plausible output that no model produced, which is the one outcome
 * this system must never have.
 *
 * With nothing configured, demo mode keeps its template executor — that is
 * the documented default that makes a fresh clone run — and the Supabase path
 * reports generation unconfigured. Both run the same durable pipeline; only
 * the producer differs.
 */
function generationEngine(isDemo: boolean) {
  if (hasModelProvider()) return modelGeneration;
  return isDemo ? templateGeneration : unconfiguredGeneration;
}

export function getContainer(): ServiceContainer {
  if (cached) return cached;

  if (backendMode() === "demo") {
    cached = {
      auth: demoAuth,
      workspaces: demoWorkspaces,
      projects: demoProjects,
      revisions: demoRevisions,
      files: demoFiles,
      runs: demoRuns,
      storage: demoStorage,
      generation: generationEngine(true),
      // The same runtime in both modes: it serves a revision's frozen tree,
      // and a frozen tree is backend-independent.
      preview: previewRuntime,
      publisher: demoPublisher,
    };
    return cached;
  }

  const caps = capabilities();
  cached = {
    auth: supabaseAuth,
    workspaces: supabaseWorkspaces,
    projects: supabaseProjects,
    // Backed by the tables in migrations 0003 and 0004. Row Level Security
    // scopes every one of them to the project's owner, so a caller cannot
    // reach another user's tree, history or runs.
    revisions: supabaseRevisions,
    files: supabaseFiles,
    runs: supabaseRuns,
    storage: caps.storage ? supabaseStorage : unconfiguredStorage,
    // The engine can run against Supabase the moment its repositories exist;
    // the model path itself has no backend dependency.
    generation: generationEngine(false),
    preview: previewRuntime,
    publisher: unconfiguredPublisher,
  };
  return cached;
}

/** Test seam: lets a suite install fakes without touching module internals. */
export function __setContainer(next: ServiceContainer | null) {
  cached = next;
}

/** The container the worker runs under.
 *
 * The worker has no session, so in Supabase mode it needs repositories backed
 * by the service role rather than the caller's cookie. Everything else is
 * identical — same pipeline, same producers, same validation — which is the
 * point: the worker is not a second code path, only a different identity.
 *
 * Demo mode has no row-level security to satisfy, so it reuses the same
 * adapters unchanged.
 */
export function getWorkerContainer(): ServiceContainer {
  const base = getContainer();
  if (backendMode() === "demo") return base;
  return {
    ...base,
    files: workerRepositories.files,
    revisions: workerRepositories.revisions,
    runs: workerRepositories.runs,
  };
}
