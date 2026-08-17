/** What the workspace can show of a project, and what it cannot.
 *
 * ## The boundary
 *
 *   Project → PreviewService (this file) → PreviewRuntime → a URL
 *
 * The service owns authorisation and revision selection. The runtime owns
 * execution — materialising files, allocating a port, serving. The workspace
 * consumes only what this returns and never builds a preview URL itself, which
 * is what stops it bypassing the checks below.
 *
 * Swapping the local runtime for a sandbox or a cloud one changes the adapter
 * behind `container.preview` and nothing here.
 *
 * ## Two kinds of "no preview"
 *
 * A project with nothing built yet is not an error — it is the expected state
 * of a new project, and the UI shows an invitation. A runtime that failed *is*
 * an error and carries a stage and a message. Collapsing the two would mean
 * either alarming people about a normal state or hiding real failures.
 */
import type {
  PreviewEntry,
  PreviewFailure,
  PreviewIsolation,
  PreviewState,
  ProjectId,
  Revision,
  Session,
} from "../domain";
import { getContainer } from "../server/container";
import { getProject } from "./projects";

/** A page the preview serves, with an absolute URL the browser can load. */
export interface PreviewPageLink {
  route: string;
  title: string;
  url: string;
}

export type PreviewTarget =
  | {
      kind: "runtime";
      state: PreviewState;
      /** How well this preview is actually contained. Passed through rather
       *  than assumed, so the workspace can say what is true on this host
       *  instead of implying a guarantee. */
      isolation: PreviewIsolation;
      revisionId: string;
      /** The frame's source. Null until the runtime is listening. */
      url: string | null;
      pages: readonly PreviewPageLink[];
      /** Changes when the served content does, so a client can tell a real
       *  update from a poll that happened to land. */
      version: string;
      /** Set when the runtime failed. The message is for the panel; `detail`
       *  belongs behind a debug disclosure. */
      failure: PreviewFailure | null;
    }
  | {
      kind: "unavailable";
      reason: string;
      /** Distinguishes an expected empty state from a real gap. */
      because: "no-revision" | "no-project-files";
    };

/** Which revision a preview should show: the project's head. */
function headRevisionOf(
  project: { currentRevisionId: string | null },
  revisions: readonly Revision[]
): Revision | undefined {
  return project.currentRevisionId
    ? (revisions.find((r) => r.id === project.currentRevisionId) ?? revisions[0])
    : revisions[0];
}

function linksFor(origin: string | null, entries: readonly PreviewEntry[]): PreviewPageLink[] {
  if (!origin) return [];
  return entries.map((entry) => ({
    route: entry.route,
    title: entry.title,
    // Built here, from an origin the runtime reported. A component that
    // assembled this itself could point the frame anywhere.
    url: `${origin}${entry.route}`,
  }));
}

/** Starts (or joins) the preview for a project and reports where it is.
 *
 * Idempotent: called on every workspace poll. The runtime returns the running
 * session when the revision has not changed, and restarts when it has — so
 * "keep the preview current" needs no separate call from the UI.
 */
export async function getPreviewTarget(
  session: Session,
  projectId: ProjectId
): Promise<PreviewTarget> {
  // The authorisation gate. Everything below is reached through it, so a
  // project id belonging to someone else fails here and no runtime is started
  // on their behalf.
  const project = await getProject(session, projectId);
  const container = getContainer();

  const revisions = await container.revisions.listForProject(projectId);
  const head = headRevisionOf(project, revisions);

  if (!head) {
    // Expected, not broken.
    return {
      kind: "unavailable",
      because: "no-revision",
      reason: "Nothing has been built yet. Describe what you want and Orbital will make a start.",
    };
  }

  const running = await container.preview.start(projectId, head.id);

  return {
    kind: "runtime",
    state: running.state,
    isolation: running.isolation,
    revisionId: running.revisionId,
    url: running.origin ? `${running.origin}/` : null,
    pages: linksFor(running.origin, running.entries),
    // Revision plus version: the revision covers a new generation, the version
    // covers a restart of the same one.
    version: `${running.revisionId}:${running.version}`,
    failure: running.failure,
  };
}

/** The current preview without starting one.
 *
 * For polling a preview that is already running: it refreshes the runtime's
 * idle deadline without the cost of a start call. Returns null when nothing is
 * running, which the caller should treat as "ask for one".
 */
export async function getPreviewStatus(
  session: Session,
  projectId: ProjectId
): Promise<PreviewTarget | null> {
  await getProject(session, projectId);

  const running = await getContainer().preview.status(projectId);
  if (!running) return null;

  return {
    kind: "runtime",
    state: running.state,
    isolation: running.isolation,
    revisionId: running.revisionId,
    url: running.origin ? `${running.origin}/` : null,
    pages: linksFor(running.origin, running.entries),
    version: `${running.revisionId}:${running.version}`,
    failure: running.failure,
  };
}

/** Tears the preview down and starts it again at the same revision.
 *
 * For a preview that crashed, or one a person simply does not trust. Distinct
 * from a browser reload, which re-fetches from a server that may itself be the
 * problem.
 */
export async function restartPreview(
  session: Session,
  projectId: ProjectId
): Promise<PreviewTarget> {
  await getProject(session, projectId);
  const container = getContainer();

  const existing = await container.preview.status(projectId);
  // Nothing to restart yet — start one instead, so the button does the
  // obvious thing rather than reporting an error about internal state.
  if (!existing) return getPreviewTarget(session, projectId);

  const running = await container.preview.restart(projectId);
  return {
    kind: "runtime",
    state: running.state,
    isolation: running.isolation,
    revisionId: running.revisionId,
    url: running.origin ? `${running.origin}/` : null,
    pages: linksFor(running.origin, running.entries),
    version: `${running.revisionId}:${running.version}`,
    failure: running.failure,
  };
}

/** Frees the preview's port and directory. */
export async function stopPreview(session: Session, projectId: ProjectId): Promise<void> {
  await getProject(session, projectId);
  await getContainer().preview.stop(projectId);
}
