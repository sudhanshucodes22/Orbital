/** A running preview of a revision.
 *
 * ## What a preview actually is here
 *
 * Orbital's generated projects are static, self-contained HTML and CSS. That
 * is not an accident of the demo engine — it is the contract the model is
 * given in `ai/prompts.ts`: *"There is no build step, no package installer and
 * no shell… Generated output is served as static files"*, and every page must
 * render on its own with no external stylesheets, scripts, fonts or images.
 *
 * So a real runtime for this format materialises the revision's files and
 * serves them over HTTP. It does not run `npm install`, because there is no
 * package.json to install and nothing would use it. Building a Node dev-server
 * runtime would be building for a project format Orbital does not produce.
 *
 * The model below is nonetheless shaped for a runtime that *does* own a
 * process — states for starting and restarting, a failure with a stage, an
 * expiry — because the local runtime is an MVP and a sandboxed one will need
 * all of it. The states are not decoration: the local runtime genuinely
 * allocates a port, starts a server and can fail at each step.
 */
import type { ProjectId, RevisionId, Timestamp } from "./ids";

/** The lifecycle. Every value is a state the runtime can genuinely be in;
 *  none is inferred by the UI. */
export type PreviewState =
  | "starting"
  | "ready"
  | "restarting"
  | "stopped"
  | "failed";

export const PREVIEW_STATES: readonly PreviewState[] = [
  "starting",
  "ready",
  "restarting",
  "stopped",
  "failed",
];

/** Whether the runtime is doing something and a caller should keep watching. */
export function isPreviewTransitioning(state: PreviewState): boolean {
  return state === "starting" || state === "restarting";
}

/** Where a preview broke.
 *
 * `stage` is the machine-readable part, so a caller can distinguish "this
 * project cannot be previewed" from "the host ran out of ports" without
 * pattern-matching a sentence. `message` is written for a person and is the
 * only part rendered by default.
 *
 * `detail` is for the debug disclosure. It may carry a port number or a
 * runtime error string, and it must never carry a host filesystem path, an
 * environment variable or a credential — the runtime is responsible for
 * stripping those before they reach this type.
 */
export type PreviewFailureStage =
  | "materialize"
  | "unsupportedProject"
  | "emptyProject"
  | "portAllocation"
  | "startup"
  | "crashed"
  | "timeout"
  | "unknown";

export interface PreviewFailure {
  stage: PreviewFailureStage;
  message: string;
  detail: string | null;
}

/** A page the preview can serve, for the workspace's page switcher. */
export interface PreviewEntry {
  /** Route as a visitor would type it: "/" or "/about". */
  route: string;
  /** The file backing it: "index.html", "about.html". */
  path: string;
  title: string;
}

/** One running preview.
 *
 * Keyed by project: a project has at most one preview, because a second one
 * serving a different revision of the same project is a way to look at the
 * wrong thing and not know it.
 */
export interface PreviewSession {
  projectId: ProjectId;
  /** The revision currently materialised. Changing it is what a restart does. */
  revisionId: RevisionId;
  state: PreviewState;
  /** Origin the browser should point at, e.g. "http://127.0.0.1:47821".
   *  Null until the server is listening. */
  origin: string | null;
  entries: readonly PreviewEntry[];
  failure: PreviewFailure | null;
  startedAt: Timestamp;
  /** Bumped whenever the served content changes, so a client can tell a real
   *  update from a poll that happened to land. */
  version: number;
  /** When an idle preview will be reaped. A preview holds a port and a
   *  directory; leaving one running forever because a tab was closed is how a
   *  dev machine ends up with fifty of them. */
  expiresAt: Timestamp;
  /** How well this preview is actually contained.
   *
   * Carried on the session rather than assumed, because it varies by host: the
   * same code provides an OS sandbox on one machine and only process
   * separation on another. Surfacing it is what stops "sandboxed" being a
   * claim nobody checked. */
  isolation: PreviewIsolation;
}

/** Containment tiers, strongest first. Mirrors `IsolationMode` in the server's
 *  isolation module; declared here because it crosses to the client. */
export type PreviewIsolation = "container" | "sandboxed" | "process" | "in-process";

/** How long a preview survives without being asked about. Refreshed on every
 *  status read, so an open workspace keeps its preview alive simply by
 *  polling. */
export const PREVIEW_IDLE_MS = 10 * 60 * 1000;

/** How long the runtime waits for a server to start listening before calling
 *  it failed. Generous for a static server, which should take milliseconds. */
export const PREVIEW_START_TIMEOUT_MS = 15 * 1000;

/** Caps on what a preview will materialise. A generated project is a handful
 *  of small files; these exist so a pathological one cannot fill a disk. */
export const PREVIEW_MAX_FILES = 500;
export const PREVIEW_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

/** Which file a route maps to, and vice versa.
 *
 * The single place that knows the convention, so the runtime's router and the
 * entry list cannot disagree about what "/" means.
 */
export function routeForFilePath(path: string): string {
  if (path === "index.html") return "/";
  if (path.endsWith("/index.html")) return `/${path.slice(0, -"/index.html".length)}`;
  if (path.endsWith(".html")) return `/${path.slice(0, -".html".length)}`;
  return `/${path}`;
}

/** Candidate files for a route, in priority order.
 *
 * Returns several because "/about" legitimately means `about.html` or
 * `about/index.html`, and which one exists is the runtime's business, not the
 * caller's. */
export function filePathsForRoute(route: string): string[] {
  const clean = route.split("?")[0].split("#")[0];
  const trimmed = clean.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") return ["index.html"];
  // An explicit file request ("styles.css", "index.html") is taken literally
  // first; the extensionless forms are the fallbacks.
  return [trimmed, `${trimmed}.html`, `${trimmed}/index.html`];
}
