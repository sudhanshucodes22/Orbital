/** Resolves the ports the application depends on.
 *
 * SERVER ONLY. Importing this from a client component pulls server
 * configuration into the browser bundle. There is no `server-only` package
 * installed to enforce that mechanically — it was not worth a dependency — so
 * the rule is: nothing under lib/server may be imported by a file carrying
 * "use client", directly or transitively.
 *
 * Each capability is selected independently from its own configuration, so a
 * project with auth and a database but no storage gets real adapters for the
 * first two and honest "not configured" errors for the third, rather than
 * all-or-nothing.
 */
import { capabilities } from "../config/env";
import type { ServiceContainer } from "../ports";
import { supabaseAuth } from "./supabase/auth";
import { supabaseProjects, supabaseWorkspaces } from "./supabase/repositories";
import { supabaseStorage } from "./supabase/storage";
import {
  unconfiguredAuth,
  unconfiguredGeneration,
  unconfiguredProjects,
  unconfiguredPublisher,
  unconfiguredRevisions,
  unconfiguredStorage,
  unconfiguredWorkspaces,
} from "./unconfigured";

let cached: ServiceContainer | null = null;

export function getContainer(): ServiceContainer {
  if (cached) return cached;
  const caps = capabilities();

  cached = {
    auth: caps.auth ? supabaseAuth : unconfiguredAuth,
    workspaces: caps.database ? supabaseWorkspaces : unconfiguredWorkspaces,
    projects: caps.database ? supabaseProjects : unconfiguredProjects,
    // Revisions arrive with the generation engine; the table does not exist yet.
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
