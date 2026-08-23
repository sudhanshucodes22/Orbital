/** The local preview runtime. SERVER ONLY. MVP.
 *
 * ## What it does
 *
 * Materialises a revision's files into a directory this process owns, starts a
 * real HTTP server on an OS-allocated port, and serves them. That is a real
 * execution environment for the format Orbital actually produces: static,
 * self-contained HTML and CSS, which the model is explicitly instructed to
 * write (`ai/prompts.ts`: *"There is no build step, no package installer and no
 * shell"*).
 *
 * It does not run `npm install` or spawn a dev server, because there is no
 * package.json to install and nothing would consume it. That would be building
 * for a project format Orbital does not produce.
 *
 * ## Why a separate port rather than a route in this app
 *
 * Origin isolation, and it is the main security improvement over the previous
 * preview. Served from `/api/demo/preview/...` the generated page shared this
 * application's origin, and `sandbox=""` on the iframe was the only thing
 * standing between model-authored HTML and the app's cookies. On its own port
 * it is a different origin, so the same-origin policy applies as well — two
 * independent defences instead of one.
 *
 * It also makes the runtime honest: it allocates a port, owns a process
 * resource, and can fail at startup, which is what a sandboxed runtime will
 * do too.
 *
 * ## What it is not
 *
 * Not a sandbox. The server runs in this Node process with this process's
 * privileges. It is safe because of what it *does* — reads bytes from one
 * directory and writes them to a socket, never executing them — not because
 * the operating system is stopping it from doing more. See ARCHITECTURE.md for
 * what production would require.
 */
import { createServer, type Server } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  PREVIEW_IDLE_MS,
  PREVIEW_START_TIMEOUT_MS,
  filePathsForRoute,
  type PreviewFailure,
  type PreviewSession,
  type ProjectId,
  type RevisionId,
} from "../../domain";
import type { PreviewRuntime } from "../../ports";
import { MaterializeError, materializeTree, previewRootFor } from "./materialize";

/** Where preview directories live. Under the OS temp dir rather than the
 *  repository, so a stray preview can never be mistaken for source, cannot be
 *  committed, and is cleared by the OS if we fail to. */
const PREVIEW_BASE = join(tmpdir(), "orbital-preview");

/** Loopback only. Binding 0.0.0.0 would put model-authored content on the
 *  local network — visible to anyone on the same café wifi — which is not a
 *  trade a preview should make on the developer's behalf. */
const BIND_HOST = "127.0.0.1";

/** Content types for what a generated project can contain. An unknown
 *  extension is served as a download rather than guessed at, because guessing
 *  is how a text file becomes executable script in a browser. */
const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  const extension = dot > 0 ? path.slice(dot + 1).toLowerCase() : "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

/** Everything a running preview owns. Held in memory: a preview is a live
 *  process resource, so it cannot outlive the process anyway, and persisting
 *  it would mean recording state that is false after a restart. */
interface Live {
  session: PreviewSession;
  server: Server | null;
  root: string;
  /** Reaps the preview when nothing has asked about it for a while. */
  timer: NodeJS.Timeout | null;
}

/** Files the runtime will not serve regardless of what is on disk.
 *
 * Materialisation already refuses to write these, so this is the second layer:
 * if a file ever appeared in the root by another route, the server still will
 * not hand it out. */
const NEVER_SERVE = /(^|\/)\.(git|env|ssh|aws)(\/|$)|(^|\/)node_modules(\/|$)/i;

/** Origins allowed to frame a preview.
 *
 * `frame-ancestors 'self'` would be wrong here and is the trap this function
 * exists to avoid: "self" is the *runtime's* origin, so it permits only
 * 127.0.0.1:<port> to embed the page — which means the application, on a
 * different origin, cannot. Moving the preview onto its own origin is the
 * security win; naming the embedder explicitly is the cost of it.
 *
 * Both loopback spellings of the app are included because a person may reach
 * it as `localhost` or as `127.0.0.1`, and an embed that works at one address
 * and silently blanks at the other is a miserable thing to debug.
 */
export function embedderOriginsFor(siteUrl: string): string[] {
  const origins = new Set<string>();
  try {
    const url = new URL(siteUrl);
    origins.add(url.origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      const twin = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
      origins.add(`${url.protocol}//${twin}${url.port ? `:${url.port}` : ""}`);
    }
  } catch {
    // A malformed site URL must not take the preview down with it; the
    // fallback is the development default.
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }
  return [...origins];
}

export function createLocalPreviewRuntime(
  options: { base?: string; embedderOrigins?: readonly string[] } = {}
): PreviewRuntime & {
  /** Stops everything. For tests and for process shutdown — a leaked server
   *  holds a port open for as long as the process lives. */
  shutdown(): Promise<void>;
} {
  const base = options.base ?? PREVIEW_BASE;
  // Defaults to the development origin; the container passes the configured
  // one. Never a wildcard: `frame-ancestors *` would let any page on the
  // machine embed a preview.
  const embedders =
    options.embedderOrigins && options.embedderOrigins.length > 0
      ? [...options.embedderOrigins]
      : embedderOriginsFor("http://localhost:3000");
  const frameAncestors = embedders.join(" ");
  const live = new Map<string, Live>();

  const now = () => new Date().toISOString();

  /** Pushes the idle deadline out. Called on every status read, so an open
   *  workspace keeps its preview alive just by polling. */
  function touch(entry: Live): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.session.expiresAt = new Date(Date.now() + PREVIEW_IDLE_MS).toISOString();
    entry.timer = setTimeout(() => {
      void teardown(entry.session.projectId, "stopped");
    }, PREVIEW_IDLE_MS);
    // A reaper must not hold the process open. Without this, `npm test` hangs
    // for ten minutes waiting for a timer nobody is going to observe.
    entry.timer.unref?.();
  }

  async function closeServer(server: Server | null): Promise<void> {
    if (!server) return;
    await new Promise<void>((done) => {
      // `close` waits for in-flight connections; keep-alive sockets from an
      // iframe would hold it open indefinitely, so they are dropped.
      server.closeAllConnections?.();
      server.close(() => done());
    });
  }

  async function teardown(projectId: string, state: "stopped" | "failed"): Promise<void> {
    const entry = live.get(projectId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    await closeServer(entry.server);
    entry.server = null;
    entry.session = { ...entry.session, state, origin: null };
    if (state === "stopped") live.delete(projectId);
  }

  /** The request handler. Deliberately small: resolve a route to a file inside
   *  the root, refuse anything else, stream it. No execution, no directory
   *  listing, no upward traversal. */
  function handlerFor(root: string) {
    const rootPath = resolve(root);
    const rootPrefix = rootPath.endsWith(sep) ? rootPath : rootPath + sep;

    return async (
      req: import("node:http").IncomingMessage,
      res: import("node:http").ServerResponse
    ): Promise<void> => {
      const send = (status: number, body: string, type = "text/plain; charset=utf-8") => {
        res.writeHead(status, {
          "content-type": type,
          // The preview must never be embeddable anywhere but here, and must
          // never be cached — a cached page would survive a revision change
          // and show the wrong version.
          "cache-control": "no-store, must-revalidate",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          // A 404 is framed by the workspace too, so it needs the same
          // permission as a page or it renders as an empty box.
          "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${frameAncestors}`,
        });
        res.end(body);
      };

      // Reading is the only verb a static preview needs.
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(405, "Method not allowed");
        return;
      }

      let route: string;
      try {
        // Parsed with the URL API rather than by hand: it normalises "%2e%2e"
        // and friends, which is exactly the class of input a manual parser
        // gets wrong.
        route = new URL(req.url ?? "/", "http://localhost").pathname;
      } catch {
        send(400, "Bad request");
        return;
      }

      const candidates = filePathsForRoute(route);

      for (const candidate of candidates) {
        if (NEVER_SERVE.test(candidate)) continue;

        const target = resolve(rootPath, candidate);
        // The containment check again, at serve time. Materialisation already
        // guarantees what is on disk; this guarantees what leaves it.
        if (!target.startsWith(rootPrefix)) continue;

        try {
          const info = await stat(target);
          if (!info.isFile()) continue;

          res.writeHead(200, {
            "content-type": contentTypeFor(candidate),
            "content-length": String(info.size),
            "cache-control": "no-store, must-revalidate",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            // Generated content is untrusted. It is self-contained by
            // contract, so denying every external source costs it nothing and
            // means a page that tries to phone home simply cannot.
            //
            // `style-src` needs 'self' as well as 'unsafe-inline'. Without it
            // the policy denied the page its own stylesheet: the server
            // returned style.css with a 200, and the browser refused to apply
            // it, so every generated site rendered as unstyled serif. The
            // template engine writes one file with a <style> block, which is
            // why nothing caught this until a real model split the CSS out —
            // which is what a model does by default.
            //
            // This is not a loosening. 'self' here is the preview's own
            // ephemeral origin, serving one revision's frozen tree from a
            // process with no secrets and no network egress. Every genuinely
            // external source stays denied by `default-src 'none'`, and
            // scripts stay denied by both that and the iframe's empty sandbox.
            "content-security-policy":
              "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src data: blob:; " +
              "font-src data:; media-src data:; form-action 'none'; base-uri 'none'; " +
              `frame-ancestors ${frameAncestors}`,
          });
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          createReadStream(target).pipe(res);
          return;
        } catch {
          // Not there; try the next candidate.
        }
      }

      send(
        404,
        `<!doctype html><meta charset="utf-8"><title>Not found</title>` +
          `<body style="font:15px system-ui;padding:40px;color:#444">` +
          `<p>No page at <code>${route.replace(/[<>&"]/g, "")}</code> in this revision.</p>`,
        "text/html; charset=utf-8"
      );
    };
  }

  /** Binds a server to an OS-chosen free port.
   *
   * Port 0 asks the kernel for one, which avoids the scan-and-race a fixed
   * range would need: with a range, two projects starting simultaneously can
   * both find the same "free" port and one fails to bind.
   */
  function listen(root: string): Promise<{ server: Server; port: number }> {
    return new Promise((ok, fail) => {
      const server = createServer((req, res) => {
        void handlerFor(root)(req, res).catch(() => {
          if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
          res.end("Preview error");
        });
      });

      // A generated page is small and local; a connection that has not
      // finished in this long is stuck, and stuck sockets hold the port.
      server.keepAliveTimeout = 5_000;
      server.headersTimeout = 10_000;
      server.requestTimeout = 30_000;

      const timer = setTimeout(() => {
        server.close();
        fail(
          new MaterializeError({
            stage: "timeout",
            message: "The preview server did not start in time.",
            detail: `no listen event within ${PREVIEW_START_TIMEOUT_MS}ms`,
          })
        );
      }, PREVIEW_START_TIMEOUT_MS);
      timer.unref?.();

      server.once("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        fail(
          new MaterializeError({
            stage: "portAllocation",
            message: "The preview could not claim a port on this machine.",
            // The code, not the message: a Node error message can contain the
            // bind address, and this string reaches a browser.
            detail: error.code ?? "listen failed",
          })
        );
      });

      server.listen(0, BIND_HOST, () => {
        clearTimeout(timer);
        const address = server.address();
        if (address === null || typeof address === "string") {
          server.close();
          fail(
            new MaterializeError({
              stage: "portAllocation",
              message: "The preview could not claim a port on this machine.",
              detail: "no port assigned",
            })
          );
          return;
        }
        ok({ server, port: address.port });
      });
    });
  }

  function failureOf(error: unknown): PreviewFailure {
    if (error instanceof MaterializeError) return error.failure;
    // Anything else is unexpected. It is logged server-side with its real
    // detail and reduced to a sentence here, because an arbitrary error's
    // message can carry a host path.
    console.error("[preview] unexpected runtime failure", error);
    return {
      stage: "unknown",
      message: "The preview could not be started.",
      detail: null,
    };
  }

  /** Brings a preview up at a revision.
   *
   * Loads the tree *inside* the try, not before it. Loading is a step that can
   * fail — a deleted revision, one with no frozen tree, a store outage — and a
   * failure there has to become a `failed` session with a reason, exactly like
   * a failure to materialise or bind. Loading outside would let it escape as
   * an exception, and the caller would turn it into a generic "something went
   * wrong" with the real explanation lost.
   */
  async function boot(
    projectId: ProjectId,
    revisionId: RevisionId,
    previous: Live | null
  ): Promise<PreviewSession> {
    const root = previewRootFor(base, projectId);

    // Announce the transition before doing the work, so a caller polling
    // during a slow start sees `starting` rather than a stale `ready`.
    const transitional: PreviewSession = {
      projectId,
      revisionId,
      state: previous ? "restarting" : "starting",
      origin: null,
      entries: previous?.session.entries ?? [],
      failure: null,
      startedAt: now(),
      version: (previous?.session.version ?? 0) + 1,
      expiresAt: new Date(Date.now() + PREVIEW_IDLE_MS).toISOString(),
      // Named honestly. This runtime serves from inside the application's own
      // process; calling it anything stronger would be the exact
      // misrepresentation the isolation model exists to prevent.
      isolation: "in-process",
    };
    const entry: Live = previous ?? { session: transitional, server: null, root, timer: null };
    entry.session = transitional;
    entry.root = root;
    live.set(projectId, entry);

    // The old server goes first: the new one binds a different port anyway,
    // but leaving it running would leak a port for every revision.
    await closeServer(entry.server);
    entry.server = null;

    try {
      const tree = await loadTree(projectId, revisionId);
      const { entries } = await materializeTree(root, tree);
      const { server, port } = await listen(root);

      // A server that dies later must not leave the session claiming to be
      // ready — that is the "preview appears fine, nothing loads" failure.
      server.on("close", () => {
        const current = live.get(projectId);
        if (current && current.server === server && current.session.state === "ready") {
          current.session = {
            ...current.session,
            state: "failed",
            origin: null,
            failure: {
              stage: "crashed",
              message: "The preview server stopped unexpectedly.",
              detail: null,
            },
          };
        }
      });

      entry.server = server;
      entry.session = {
        ...transitional,
        state: "ready",
        origin: `http://${BIND_HOST}:${port}`,
        entries,
        failure: null,
      };
      touch(entry);
      return entry.session;
    } catch (error) {
      const failure = failureOf(error);
      entry.session = { ...transitional, state: "failed", origin: null, failure };
      entry.server = null;
      // Kept in the map rather than deleted: the failure is the answer to
      // "why is there no preview", and dropping it would show an empty panel
      // with no explanation.
      touch(entry);
      return entry.session;
    }
  }

  return {
    async start(projectId, revisionId) {
      const existing = live.get(projectId);

      // Idempotent for the same revision. A workspace that opens twice, or a
      // poll that races the first start, must not cycle the server.
      if (
        existing &&
        existing.session.revisionId === revisionId &&
        existing.session.state === "ready" &&
        existing.server
      ) {
        touch(existing);
        return existing.session;
      }

      return boot(projectId, revisionId, existing ?? null);
    },

    async status(projectId) {
      const entry = live.get(projectId);
      if (!entry) return null;
      // Reading status is the keep-alive.
      if (entry.session.state === "ready") touch(entry);
      return entry.session;
    },

    async stop(projectId) {
      await teardown(projectId, "stopped");
    },

    async restart(projectId) {
      const entry = live.get(projectId);
      if (!entry) {
        throw new MaterializeError({
          stage: "unknown",
          message: "There is no preview to restart.",
          detail: null,
        });
      }
      const { projectId: id, revisionId } = entry.session;
      return boot(id, revisionId, entry);
    },

    async shutdown() {
      await Promise.all([...live.keys()].map((id) => teardown(id, "stopped")));
      live.clear();
    },
  };
}

/** How the runtime gets a revision's files.
 *
 * Injected rather than imported so the runtime does not reach into the
 * container — and so tests can drive it with a tree directly, without a store.
 */
type TreeLoader = (
  projectId: ProjectId,
  revisionId: RevisionId
) => Promise<readonly import("../../domain").FileSnapshot[]>;

let loadTree: TreeLoader = async () => {
  throw new MaterializeError({
    stage: "unknown",
    message: "The preview runtime has not been configured.",
    detail: null,
  });
};

/** Wires the runtime to a source of revision trees. Called once, from the
 *  container. */
export function __setPreviewTreeLoader(loader: TreeLoader): void {
  loadTree = loader;
}
