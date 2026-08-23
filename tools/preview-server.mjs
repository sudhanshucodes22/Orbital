#!/usr/bin/env node
/** The preview server, as its own process.
 *
 * Runs *outside* the Orbital application: a standalone script with no import
 * of the app's code, no database client, no provider SDK, and — because the
 * parent constructs its environment from an allowlist — none of the app's
 * secrets. If this process were fully compromised it would hold a directory of
 * generated HTML and nothing else.
 *
 * That structural property is the point. The previous runtime was safe because
 * of what it chose to do; this one is safe because of what it *has*.
 *
 * Configuration arrives as a single JSON argument rather than through the
 * environment, so the environment can stay empty. The port is chosen by the
 * kernel and announced on stdout, because a parent that picked the port would
 * have to scan for a free one and could race another process to it.
 *
 * Protocol with the parent:
 *   stdout  {"ready":true,"port":N}   once listening
 *   stdout  {"error":"..."}           if it cannot start
 *   SIGTERM shut down
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const config = JSON.parse(process.argv[2] ?? "{}");
const root = resolve(config.root ?? "");
const frameAncestors = String(config.frameAncestors ?? "'none'");
const host = "127.0.0.1";

/** Resolved once with a trailing separator, so the containment test cannot be
 *  fooled by a sibling directory whose name merely starts with the root's. */
const rootPrefix = root.endsWith(sep) ? root : root + sep;

const CONTENT_TYPES = {
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

/** Unknown extensions are served as bytes, never guessed — guessing is how a
 *  text file becomes executable script in a browser. */
function contentTypeFor(path) {
  const dot = path.lastIndexOf(".");
  const extension = dot > 0 ? path.slice(dot + 1).toLowerCase() : "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

/** Files this server will not hand out whatever is on disk. Materialisation
 *  already refuses to write them; this is the second layer. */
const NEVER_SERVE = /(^|\/)\.(git|env|ssh|aws)(\/|$)|(^|\/)node_modules(\/|$)/i;

/** Candidate files for a route, in priority order. "/about" legitimately means
 *  `about.html` or `about/index.html`. */
function candidatesFor(route) {
  const clean = route.split("?")[0].split("#")[0];
  const trimmed = clean.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") return ["index.html"];
  return [trimmed, `${trimmed}.html`, `${trimmed}/index.html`];
}

const SECURITY_HEADERS = {
  "cache-control": "no-store, must-revalidate",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

/** Must stay in step with `local-runtime.ts`, which serves the same trees when
 *  the sandboxed tier is unavailable. Two copies of a policy is two chances to
 *  fix only one — the `style-src 'self'` bug below was fixed there first and
 *  went on rendering unstyled here. */
function policy(extra = "") {
  return (
    // 'self' is the preview's own ephemeral origin. Without it the page is
    // denied its own <link rel=stylesheet>: the file is served with a 200 and
    // the browser refuses to apply it, so every generated site renders as
    // unstyled serif. Everything genuinely external stays denied by
    // `default-src 'none'`.
    `default-src 'none'; style-src 'self' 'unsafe-inline'; img-src data: blob:; ` +
    `font-src data:; media-src data:; form-action 'none'; base-uri 'none'; ` +
    `frame-ancestors ${frameAncestors}${extra}`
  );
}

const server = createServer(async (req, res) => {
  const send = (status, body, type = "text/plain; charset=utf-8") => {
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      "content-type": type,
      // A 404 is framed by the workspace like any other page; without the same
      // permission it renders as an empty box.
      "content-security-policy": policy(),
    });
    res.end(body);
  };

  try {
    // Reading is the only verb a static preview needs.
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(405, "Method not allowed");
      return;
    }

    let route;
    try {
      // The URL API normalises "%2e%2e" and friends — exactly the class of
      // input a hand-rolled parser gets wrong.
      route = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      send(400, "Bad request");
      return;
    }

    for (const candidate of candidatesFor(route)) {
      if (NEVER_SERVE.test(candidate)) continue;

      const target = resolve(root, candidate);
      // Checked after resolution, because resolution is what a traversal
      // manipulates. This is the check that actually holds.
      if (!target.startsWith(rootPrefix)) continue;

      let info;
      try {
        info = await stat(target);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;

      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "content-type": contentTypeFor(candidate),
        "content-length": String(info.size),
        "content-security-policy": policy(),
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(target).pipe(res);
      return;
    }

    send(
      404,
      `<!doctype html><meta charset="utf-8"><title>Not found</title>` +
        `<body style="font:15px system-ui;padding:40px;color:#444">` +
        `<p>No page at <code>${route.replace(/[<>&"]/g, "")}</code> in this revision.</p>`,
      "text/html; charset=utf-8"
    );
  } catch {
    // A request must never take the server down; that would turn one bad URL
    // into a dead preview.
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("Preview error");
  }
});

// A generated page is small and local. A connection that has not finished in
// this long is stuck, and stuck sockets hold the port.
server.keepAliveTimeout = 5_000;
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
// Bounded so a client cannot exhaust the process by opening sockets.
server.maxConnections = 64;

server.on("error", (error) => {
  process.stdout.write(`${JSON.stringify({ error: error.code ?? "listen failed" })}\n`);
  process.exit(1);
});

server.listen(0, host, () => {
  const address = server.address();
  if (address === null || typeof address === "string") {
    process.stdout.write(`${JSON.stringify({ error: "no port assigned" })}\n`);
    process.exit(1);
    return;
  }
  process.stdout.write(`${JSON.stringify({ ready: true, port: address.port })}\n`);
});

/** Deterministic shutdown. The parent sends SIGTERM; in-flight keep-alive
 *  sockets are dropped rather than waited on, because an iframe holds one open
 *  indefinitely and the port would never be released. */
function shutdown() {
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  // If close does not complete promptly, leaving is better than lingering with
  // a port held.
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/** A hard lifetime ceiling, independent of the parent.
 *
 * If the parent dies without cleaning up, this is what stops the preview
 * outliving it forever. The parent's idle reaping is the normal path; this is
 * the backstop. */
const maxLifetimeMs = Number(config.maxLifetimeMs) || 60 * 60 * 1000;
setTimeout(() => process.exit(0), maxLifetimeMs).unref();
