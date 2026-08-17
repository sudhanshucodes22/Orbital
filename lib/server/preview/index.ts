/** Choosing a preview runtime. SERVER ONLY.
 *
 * A module-level singleton, because a runtime owns live child processes and
 * ports. Rebuilding it would orphan them: they would keep listening with
 * nothing left holding a reference to stop them.
 *
 * ## How the runtime is chosen
 *
 * The sandboxed runtime is the default, at whatever containment tier this host
 * supports — an OS sandbox where one is available, plain process separation
 * where it is not. Both are a real improvement on serving from inside the
 * application's process, and `detectIsolation()` reports which is actually in
 * force rather than letting "sandboxed" be assumed.
 *
 * The in-process runtime remains as an **explicit** development fallback,
 * selected only by `ORBITAL_PREVIEW_RUNTIME=in-process`. It is never chosen
 * silently, it warns when it is, and it reports `isolation: "in-process"` so
 * nothing downstream can present it as sandboxing.
 */
import { publicEnv } from "../../config/env";
import type { FileSnapshot, ProjectId, RevisionId } from "../../domain";
import { createLocalPreviewRuntime, embedderOriginsFor } from "./local-runtime";
import { MaterializeError } from "./materialize";
import { createSandboxedPreviewRuntime } from "./sandbox-runtime";
import type { IsolationCapability } from "./isolation";

export { MaterializeError, materializeTree, previewRootFor } from "./materialize";
export { __setPreviewTreeLoader, createLocalPreviewRuntime } from "./local-runtime";
export { createSandboxedPreviewRuntime, PREVIEW_LIMITS } from "./sandbox-runtime";
export {
  __setIsolation,
  detectIsolation,
  previewCommand,
  previewEnvironment,
  seatbeltProfile,
} from "./isolation";
export type { IsolationCapability, IsolationMode } from "./isolation";

/** How the runtime reads a revision's frozen tree.
 *
 * Injected so the runtime never imports the container — the container imports
 * *this*, and a cycle that happens to work today breaks the first time someone
 * moves a line. Installed by `container.ts`.
 */
type TreeLoader = (
  projectId: ProjectId,
  revisionId: RevisionId
) => Promise<readonly FileSnapshot[]>;

let loadTree: TreeLoader = async () => {
  throw new MaterializeError({
    stage: "unknown",
    message: "The preview runtime has not been configured.",
    detail: null,
  });
};

/** Installs the tree loader. Also forwarded to the in-process runtime, which
 *  keeps its own copy from the previous milestone. */
export function __setPreviewLoader(loader: TreeLoader): void {
  loadTree = loader;
}

/** Which runtime the deployment asked for. Only an explicit opt-out picks the
 *  weaker one. */
function requestedRuntime(): "sandboxed" | "in-process" {
  return process.env.ORBITAL_PREVIEW_RUNTIME === "in-process" ? "in-process" : "sandboxed";
}

const IN_PROCESS_CAPABILITY: IsolationCapability = {
  mode: "in-process",
  summary: "Previews run inside the application process. Development only.",
  guarantees: ["Reads confined to the preview root by path resolution in the server"],
  limitations: [
    "No process separation: a preview fault can affect the application",
    "The preview shares the application's environment and privileges",
    "No OS sandbox and no resource limits beyond file count and size caps",
  ],
};

function build(): { runtime: ReturnType<typeof createSandboxedPreviewRuntime> | ReturnType<typeof createLocalPreviewRuntime>; capability: IsolationCapability } {
  const embedderOrigins = embedderOriginsFor(publicEnv.siteUrl);

  if (requestedRuntime() === "in-process") {
    // Loud on purpose. Running generated content inside the application's own
    // process is a real reduction in isolation, and it should not be possible
    // to be in that mode without having chosen it.
    console.warn(
      "[preview] ORBITAL_PREVIEW_RUNTIME=in-process — previews run inside the " +
        "application process with its privileges. Development only."
    );
    return {
      runtime: createLocalPreviewRuntime({ embedderOrigins }),
      capability: IN_PROCESS_CAPABILITY,
    };
  }

  const runtime = createSandboxedPreviewRuntime({
    embedderOrigins,
    // Indirect, so the loader can be installed after this module is built.
    loadTree: (projectId, revisionId) => loadTree(projectId, revisionId),
  });
  return { runtime, capability: runtime.capability() };
}

const selected = build();

/** The process-wide runtime. */
export const previewRuntime = selected.runtime;

/** What isolation is actually in force.
 *
 * Surfaced to the workspace so it can say so, and to `/api/health` so an
 * operator can check without reading the source. */
export function previewCapability(): IsolationCapability {
  return selected.capability;
}
