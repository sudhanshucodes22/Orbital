/** The local preview runtime, for real.
 *
 * These tests bind actual ports, write actual files and fetch over actual
 * HTTP. Mocking the server would test the parts that cannot break — the
 * interesting failures here are containment, lifecycle and cleanup, and none
 * of those are observable against a fake.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { asProjectId, asRevisionId, byteLength, hashContent } from "../lib/domain";
import type { FileSnapshot, ProjectId, RevisionId } from "../lib/domain";
import {
  __setPreviewTreeLoader,
  createLocalPreviewRuntime,
  embedderOriginsFor,
} from "../lib/server/preview/local-runtime";

const PROJECT = asProjectId("11111111-2222-3333-4444-555555555555");
const REVISION_A = asRevisionId("rev-a");
const REVISION_B = asRevisionId("rev-b");

function file(path: string, content: string): FileSnapshot {
  return {
    path,
    kind: "text",
    content,
    storageKey: null,
    hash: hashContent(content),
    byteSize: byteLength(content),
  };
}

const SITE_A: FileSnapshot[] = [
  file("index.html", "<!doctype html><title>Home A</title><h1>Version A</h1>"),
  file("about.html", "<!doctype html><title>About</title><h1>About us</h1>"),
  file("styles.css", "body{color:rebeccapurple}"),
];

const SITE_B: FileSnapshot[] = [
  file("index.html", "<!doctype html><title>Home B</title><h1>Version B</h1>"),
];

/** Trees the runtime will be asked for, keyed by revision. */
const trees = new Map<string, readonly FileSnapshot[]>([
  [REVISION_A, SITE_A],
  [REVISION_B, SITE_B],
]);

let base: string;
let runtime: ReturnType<typeof createLocalPreviewRuntime>;

before(async () => {
  base = await mkdtemp(join(tmpdir(), "orbital-preview-test-"));
});

after(async () => {
  await rm(base, { recursive: true, force: true });
});

beforeEach(() => {
  runtime = createLocalPreviewRuntime({
    base,
    embedderOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
  });
  __setPreviewTreeLoader(async (_projectId: ProjectId, revisionId: RevisionId) => {
    const tree = trees.get(revisionId);
    if (!tree) throw new Error("no such revision");
    return tree;
  });
});

afterEach(async () => {
  // Every test tears its runtime down. A leaked server holds a port for the
  // life of the process, and the suite would slowly stop being able to bind.
  await runtime.shutdown();
});

/** Fetches a path from a running session. */
async function get(origin: string, path: string) {
  const response = await fetch(`${origin}${path}`);
  return { status: response.status, body: await response.text(), headers: response.headers };
}

describe("preview runtime lifecycle", () => {
  it("starts, reports ready, and serves the revision's files", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);

    assert.equal(session.state, "ready");
    assert.ok(session.origin, "a ready session must have an origin");
    assert.equal(session.revisionId, REVISION_A);

    const home = await get(session.origin!, "/");
    assert.equal(home.status, 200);
    assert.match(home.body, /Version A/);
  });

  it("serves the real files, not a rendering of them", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    const css = await get(session.origin!, "/styles.css");

    assert.equal(css.status, 200);
    assert.equal(css.body, "body{color:rebeccapurple}");
    assert.match(css.headers.get("content-type") ?? "", /text\/css/);
  });

  it("maps routes to files the way a static host would", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);

    // "/about" and "/about.html" are the same page.
    for (const route of ["/about", "/about.html"]) {
      const page = await get(session.origin!, route);
      assert.equal(page.status, 200, `${route} should resolve`);
      assert.match(page.body, /About us/);
    }
  });

  it("lists the pages it can serve, home first", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    assert.deepEqual(
      session.entries.map((e) => e.route),
      ["/", "/about"]
    );
    // The title comes out of the document, not the filename.
    assert.equal(session.entries[0].title, "Home A");
  });

  it("404s a route with no file, without leaking anything", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    const missing = await get(session.origin!, "/nope");

    assert.equal(missing.status, 404);
    assert.doesNotMatch(missing.body, new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("is idempotent for the same revision", async () => {
    const first = await runtime.start(PROJECT, REVISION_A);
    const second = await runtime.start(PROJECT, REVISION_A);

    // Same server, same port: a workspace that opens twice, or a poll that
    // races the first start, must not cycle the runtime.
    assert.equal(second.origin, first.origin);
    assert.equal(second.version, first.version);
  });

  it("re-materializes when the revision changes", async () => {
    const first = await runtime.start(PROJECT, REVISION_A);
    const second = await runtime.start(PROJECT, REVISION_B);

    assert.equal(second.state, "ready");
    assert.equal(second.revisionId, REVISION_B);
    assert.ok(second.version > first.version, "a new revision must bump the version");

    const home = await get(second.origin!, "/");
    assert.match(home.body, /Version B/);

    // And the previous revision's extra page is gone, not left behind — a
    // stale file served alongside new ones is the subtle version of this bug.
    const stale = await get(second.origin!, "/about");
    assert.equal(stale.status, 404);
  });

  it("reports status without starting anything", async () => {
    assert.equal(await runtime.status(PROJECT), null);

    await runtime.start(PROJECT, REVISION_A);
    const status = await runtime.status(PROJECT);
    assert.equal(status?.state, "ready");
  });

  it("stops, frees the port, and reports nothing running", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    const origin = session.origin!;

    await runtime.stop(PROJECT);
    assert.equal(await runtime.status(PROJECT), null);

    // The server is genuinely gone, not merely forgotten.
    await assert.rejects(() => fetch(`${origin}/`), "the port should no longer accept connections");
  });

  it("restarts at the same revision with a new version", async () => {
    const first = await runtime.start(PROJECT, REVISION_A);
    const restarted = await runtime.restart(PROJECT);

    assert.equal(restarted.state, "ready");
    assert.equal(restarted.revisionId, REVISION_A);
    assert.ok(restarted.version > first.version);

    const home = await get(restarted.origin!, "/");
    assert.equal(home.status, 200);
  });

  it("stop is safe when nothing is running", async () => {
    await runtime.stop(PROJECT);
    await runtime.stop(PROJECT);
    assert.equal(await runtime.status(PROJECT), null);
  });

  it("gives two projects separate servers and separate content", async () => {
    const other = asProjectId("99999999-8888-7777-6666-555555555555");
    const a = await runtime.start(PROJECT, REVISION_A);
    const b = await runtime.start(other, REVISION_B);

    assert.notEqual(a.origin, b.origin, "projects must not share a port");
    assert.match((await get(a.origin!, "/")).body, /Version A/);
    assert.match((await get(b.origin!, "/")).body, /Version B/);

    await runtime.stop(other);
  });
});

describe("preview runtime isolation", () => {
  it("refuses to serve a path that climbs out of the root", async () => {
    // A secret next to the preview root, of the sort a traversal would want.
    await writeFile(join(base, "secret.txt"), "TOP SECRET", "utf8");
    const session = await runtime.start(PROJECT, REVISION_A);

    // Encoded, double-encoded and raw. `fetch` normalises some of these before
    // they leave, which is itself part of the defence; the server's own
    // resolution check is what catches the rest.
    const attempts = [
      "/../secret.txt",
      "/..%2fsecret.txt",
      "/%2e%2e%2fsecret.txt",
      "/..%252fsecret.txt",
      "/....//secret.txt",
    ];

    for (const attempt of attempts) {
      const result = await get(session.origin!, attempt);
      assert.notEqual(result.status, 200, `${attempt} must not succeed`);
      assert.doesNotMatch(result.body, /TOP SECRET/, `${attempt} leaked the file`);
    }
  });

  it("refuses to write a file that escapes the project root", async () => {
    trees.set(asRevisionId("rev-evil"), [
      file("index.html", "<title>ok</title>"),
      // The domain validator rejects this, and the resolution check behind it
      // would too. Either way it must not land on disk.
      { ...file("x.html", "pwned"), path: "../escaped.html" },
    ]);

    const session = await runtime.start(PROJECT, asRevisionId("rev-evil"));
    assert.equal(session.state, "failed");
    assert.equal(session.failure?.stage, "materialize");

    trees.delete(asRevisionId("rev-evil"));
  });

  it("does not serve dot-directories even if one reaches the root", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    // Plant one directly, bypassing materialisation, to prove the server has
    // its own refusal rather than trusting what wrote the directory.
    const root = join(base, PROJECT);
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".git", "config"), "url = git@example.com", "utf8");

    const leaked = await get(session.origin!, "/.git/config");
    assert.notEqual(leaked.status, 200);
  });

  it("binds loopback only, never the local network", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    assert.match(session.origin!, /^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("sends headers that stop the page reaching outside itself", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    const home = await get(session.origin!, "/");

    const csp = home.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'none'/);
    assert.equal(home.headers.get("x-content-type-options"), "nosniff");
    // Never cached: a cached page would survive a revision change and show the
    // wrong version.
    assert.match(home.headers.get("cache-control") ?? "", /no-store/);
  });

  it("lets the application frame it, and names who may", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    const csp = (await get(session.origin!, "/")).headers.get("content-security-policy") ?? "";

    // `frame-ancestors 'self'` would be the natural thing to write and is
    // wrong: "self" is the *runtime's* origin, so the app — on a different
    // one — could not embed the preview, and the panel would render blank
    // with no error. This is the regression test for that.
    assert.match(csp, /frame-ancestors [^;]*http:\/\/localhost:3000/);
    assert.doesNotMatch(csp, /frame-ancestors 'self'/);
    // And never a wildcard: any page on the machine could embed a preview.
    assert.doesNotMatch(csp, /frame-ancestors[^;]*\*/);
  });

  it("lets the 404 page be framed too", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    const missing = await get(session.origin!, "/nope");
    const csp = missing.headers.get("content-security-policy") ?? "";

    // A 404 is shown inside the workspace like any other page; without the
    // same permission it renders as an empty box.
    assert.match(csp, /frame-ancestors [^;]*localhost:3000/);
  });

  it("refuses methods a static preview has no use for", async () => {
    const session = await runtime.start(PROJECT, REVISION_A);
    const response = await fetch(`${session.origin}/`, { method: "POST" });
    assert.equal(response.status, 405);
  });

  it("serves an unknown extension as bytes rather than guessing", async () => {
    trees.set(asRevisionId("rev-odd"), [
      file("index.html", "<title>ok</title>"),
      file("data.weird", "<script>alert(1)</script>"),
    ]);
    const session = await runtime.start(PROJECT, asRevisionId("rev-odd"));
    const odd = await get(session.origin!, "/data.weird");

    // Guessing is how a text file becomes executable script in a browser.
    assert.equal(odd.headers.get("content-type"), "application/octet-stream");
    trees.delete(asRevisionId("rev-odd"));
  });
});

describe("embedderOriginsFor", () => {
  it("includes both loopback spellings, so either address works", () => {
    const origins = embedderOriginsFor("http://localhost:3000");
    assert.ok(origins.includes("http://localhost:3000"));
    assert.ok(origins.includes("http://127.0.0.1:3000"));
  });

  it("uses a real deployment origin as-is", () => {
    assert.deepEqual(embedderOriginsFor("https://orbital.example.com"), [
      "https://orbital.example.com",
    ]);
  });

  it("falls back rather than throwing on a malformed site URL", () => {
    // A bad environment variable must not take the preview down with it.
    const origins = embedderOriginsFor("not a url");
    assert.ok(origins.length > 0);
  });
});

describe("preview runtime failures", () => {
  it("reports a revision with no files as a failure, not a blank page", async () => {
    trees.set(asRevisionId("rev-empty"), []);
    const session = await runtime.start(PROJECT, asRevisionId("rev-empty"));

    assert.equal(session.state, "failed");
    assert.equal(session.failure?.stage, "emptyProject");
    assert.ok(session.failure?.message);
    trees.delete(asRevisionId("rev-empty"));
  });

  it("explains a project with no HTML rather than serving nothing", async () => {
    trees.set(asRevisionId("rev-nohtml"), [file("readme.txt", "just a note")]);
    const session = await runtime.start(PROJECT, asRevisionId("rev-nohtml"));

    assert.equal(session.state, "failed");
    assert.equal(session.failure?.stage, "unsupportedProject");
    trees.delete(asRevisionId("rev-nohtml"));
  });

  it("keeps the failure readable and free of host paths", async () => {
    trees.set(asRevisionId("rev-nohtml2"), [file("readme.txt", "note")]);
    const session = await runtime.start(PROJECT, asRevisionId("rev-nohtml2"));

    const text = `${session.failure?.message} ${session.failure?.detail ?? ""}`;
    // The message goes to a browser; a host filesystem path must never be in
    // it. `base` is a real temp path, so this is a genuine check.
    assert.doesNotMatch(text, new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(text, /\/Users\/|\/home\/|C:\\\\/);
    trees.delete(asRevisionId("rev-nohtml2"));
  });

  it("surfaces a failure to load the revision at all", async () => {
    const session = await runtime.start(PROJECT, asRevisionId("rev-missing"));
    assert.equal(session.state, "failed");
    assert.equal(session.origin, null);
  });

  it("keeps a failed session readable rather than dropping it", async () => {
    trees.set(asRevisionId("rev-empty2"), []);
    await runtime.start(PROJECT, asRevisionId("rev-empty2"));

    // The failure is the answer to "why is there no preview"; discarding it
    // would leave an empty panel with no explanation.
    const status = await runtime.status(PROJECT);
    assert.equal(status?.state, "failed");
    assert.ok(status?.failure);
    trees.delete(asRevisionId("rev-empty2"));
  });

  it("recovers from a failure when a good revision arrives", async () => {
    trees.set(asRevisionId("rev-empty3"), []);
    await runtime.start(PROJECT, asRevisionId("rev-empty3"));

    const recovered = await runtime.start(PROJECT, REVISION_A);
    assert.equal(recovered.state, "ready");
    assert.match((await get(recovered.origin!, "/")).body, /Version A/);
    trees.delete(asRevisionId("rev-empty3"));
  });
});

describe("preview runtime cleanup", () => {
  it("shutdown stops every running preview", async () => {
    const other = asProjectId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const a = await runtime.start(PROJECT, REVISION_A);
    const b = await runtime.start(other, REVISION_A);

    await runtime.shutdown();

    for (const origin of [a.origin!, b.origin!]) {
      await assert.rejects(() => fetch(`${origin}/`), `${origin} should be closed`);
    }
  });

  it("does not leak a port when a revision change restarts the server", async () => {
    const first = await runtime.start(PROJECT, REVISION_A);
    const second = await runtime.start(PROJECT, REVISION_B);

    assert.notEqual(first.origin, second.origin);
    // The old server is closed, not merely dereferenced.
    await assert.rejects(() => fetch(`${first.origin}/`), "the old port should be released");
  });
});
