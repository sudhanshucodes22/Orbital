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
import {
  demoAuth,
  demoGeneration,
  demoProjects,
  demoPublisher,
  demoRevisions,
  demoStorage,
} from "./demo";
import { supabaseAuth } from "./supabase/auth";
import { supabaseProjects, supabaseWorkspaces } from "./supabase/repositories";
import { supabaseStorage } from "./supabase/storage";
import { demoWorkspaces } from "./demo/repositories";
import {
  unconfiguredGeneration,
  unconfiguredPublisher,
  unconfiguredRevisions,
  unconfiguredStorage,
} from "./unconfigured";

let cached: ServiceContainer | null = null;

export function getContainer(): ServiceContainer {
  if (cached) return cached;

  if (backendMode() === "demo") {
    cached = {
      auth: demoAuth,
      workspaces: demoWorkspaces,
      projects: demoProjects,
      revisions: demoRevisions,
      storage: demoStorage,
      generation: demoGeneration,
      publisher: demoPublisher,
    };
    return cached;
  }

  const caps = capabilities();
  cached = {
    auth: supabaseAuth,
    workspaces: supabaseWorkspaces,
    projects: supabaseProjects,
    // Revisions and generation arrive with a real engine; the Supabase path
    // has no table or provider for them yet.
    revisions: unconfiguredRevisions,
    storage: caps.storage ? supabaseStorage : unconfiguredStorage,
    generation: unconfiguredGeneration,
    publisher: unconfiguredPublisher,
  };
  return cached;
}

/** Test seam: lets a suite install fakes without touching module internals. */
export function __setContainer(next: ServiceContainer | null) {
  cached = next;
}
