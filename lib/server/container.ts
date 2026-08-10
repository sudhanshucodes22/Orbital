/** Resolves the ports the application depends on.
 *
 * SERVER ONLY. Importing this from a client component pulls server
 * configuration into the browser bundle. There is no `server-only` package
 * installed to enforce that mechanically — it was not worth a dependency — so
 * the rule is: nothing under lib/server may be imported by a file carrying
 * "use client", directly or transitively.
 *
 * Every adapter is currently the unconfigured one. Implementing a capability
 * means writing the adapter beside this file and swapping the line here;
 * services and pages do not change.
 */
import { capabilities } from "../config/env";
import type { ServiceContainer } from "../ports";
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

  // When a capability gains a real adapter, branch on capabilities() here.
  // Reading it now keeps the check honest rather than decorative: the health
  // endpoint and the product pages both report from the same source.
  void capabilities();

  cached = {
    auth: unconfiguredAuth,
    workspaces: unconfiguredWorkspaces,
    projects: unconfiguredProjects,
    revisions: unconfiguredRevisions,
    storage: unconfiguredStorage,
    generation: unconfiguredGeneration,
    publisher: unconfiguredPublisher,
  };
  return cached;
}

/** Test seam: lets a suite install fakes without touching module internals. */
export function __setContainer(next: ServiceContainer | null) {
  cached = next;
}
