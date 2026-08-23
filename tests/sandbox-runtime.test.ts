/** The sandboxed preview runtime — real child processes.
 *
 * These spawn actual processes, bind actual ports and fetch over actual HTTP.
 * The properties under test are the ones that only exist because the preview
 * is *not* in this process: that a crash is contained, that secrets are
 * structurally absent rather than filtered, and that shutdown is deterministic.
 *
 * Where the host provides an OS sandbox, its restrictions are asserted too.
 * Where it does not, those assertions are skipped rather than faked — the
 * point of reporting an isolation tier is that it is true.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { asProjectId, asRevisionId, byteLength, hashContent } from "../lib/domain";
import type { FileSnapshot, ProjectId, RevisionId } from "../lib/domain";
import { detectIsolation, previewEnvironment, seatbeltProfile } from "../lib/server/preview/isolation";
import {
  createSandboxedPreviewRuntime,
  PREVIEW_LIMITS,
  type SandboxedPreviewRuntime,
} from "../lib/server/preview/sandbox-runtime";

const PROJECT_A = asProjectId("aaaaaaaa-1111-2222-3333-444444444444");
const PROJECT_B = asProjectId("bbbbbbbb-1111-2222-3333-444444444444");
const REVISION_A = asRevisionId("rev-a");
const REVISION_B = asRevisionId("rev-b");
const REVISION_STYLED = asRevisionId("rev-styled");

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

/** Distinct content per project, so a cross-project leak is visible rather
 *  than inferred. */
const TREES = new Map<string, readonly FileSnapshot[]>([
  [
    `${PROJECT_A}:${REVISION_A}`,
    [
      file("index.html", "<!doctype html><title>A</title><h1>PROJECT-A-SECRET</h1>"),
      file("about.html", "<!doctype html><title>About A</title>"),
    ],
  ],
  [`${PROJECT_A}:${REVISION_B}`, [file("index.html", "<!doctype html><title>A2</title><h1>A-V2</h1>")]],
  [
    // A page and its own stylesheet — the shape a real model produces, and the
    // one the CSP used to break. See the style-src test below.
    `${PROJECT_A}:${REVISION_STYLED}`,
    [
      file(
        "index.html",
        `<!doctype html><title>Styled</title><link rel="stylesheet" href="style.css"><h1>Styled</h1>`
      ),
      file("style.css", "h1{color:rebeccapurple}"),
    ],
  ],
  [
    `${PROJECT_B}:${REVISION_A}`,
    [file("index.html", "<!doctype html><title>B</title><h1>PROJECT-B-SECRET</h1>")],
  ],
]);

let base: string;
let runtime: SandboxedPreviewRuntime;
const script = join(process.cwd(), "tools", "preview-server.mjs");

before(async () => {
  base = await mkdtemp(join(tmpdir(), "orbital-sandbox-test-"));
});

after(async () => {
  await rm(base, { recursive: true, force: true });
});

function makeRuntime(overrides: Partial<Parameters<typeof createSandboxedPreviewRuntime>[0]> = {}) {
  return createSandboxedPreviewRuntime({
    base,
    serverScript: script,
    embedderOrigins: ["http://localhost:3000"],
    loadTree: async (projectId: ProjectId, revisionId: RevisionId) => {
      const tree = TREES.get(`${projectId}:${revisionId}`);
      if (!tree) throw new Error("no such revision");
      return tree;
    },
    ...overrides,
  });
}

beforeEach(() => {
  runtime = makeRuntime();
});

afterEach(async () => {
  // A leaked child holds a port and a process slot until the machine reboots.
  await runtime.shutdown();
});

async function get(origin: string, path: string) {
  const response = await fetch(`${origin}${path}`);
  return { status: response.status, body: await response.text(), headers: response.headers };
}

describe("sandboxed runtime lifecycle", () => {
  it("starts a real child process and serves the revision", async () => {
    const session = await runtime.start(PROJECT_A, REVISION_A);

    assert.equal(session.state, "ready");
    assert.ok(session.origin);
    const home = await get(session.origin!, "/");
    assert.equal(home.status, 200);
    assert.match(home.body, /PROJECT-A-SECRET/);
  });

  it("lets a page load its own stylesheet", async () => {
    // The sandboxed child has its own copy of the policy, in
    // tools/preview-server.mjs. `style-src 'unsafe-inline'` without 'self'
    // denies the page its own <link rel=stylesheet>: the file is served with
    // a 200 and the browser refuses to apply it, so every generated site
    // rendered as unstyled serif. It was fixed in local-runtime.ts first and
    // still broken here, which is exactly the drift this test is for.
    const session = await runtime.start(PROJECT_A, REVISION_STYLED);

    const sheet = await get(session.origin!, "/style.css");
    assert.equal(sheet.status, 200, "the stylesheet must be served");

    const csp = sheet.headers.get("content-security-policy") ?? "";
    const styleSrc = /style-src ([^;]*)/.exec(csp)?.[1] ?? "";
    assert.match(styleSrc, /'self'/, `style-src must allow the preview's own files: ${csp}`);

    // What keeps 'self' a fix rather than a hole: nothing external, and no
    // script execution.
    assert.match(csp, /default-src 'none'/);
    assert.doesNotMatch(csp, /style-src [^;]*\*/);
    assert.doesNotMatch(csp, /script-src/);
  });

  it("reports the isolation tier actually in force", async () => {
    const session = await runtime.start(PROJECT_A, REVISION_A);

    // Never "in-process": this runtime does not serve from this process, and
    // the session must not be able to claim otherwise.
    assert.notEqual(session.isolation, "in-process");
    assert.ok(["sandboxed", "process"].includes(session.isolation));
    assert.equal(session.isolation, runtime.capability().mode);
  });

  it("is idempotent for the same revision", async () => {
    const first = await runtime.start(PROJECT_A, REVISION_A);
    const second = await runtime.start(PROJECT_A, REVISION_A);
    assert.equal(second.origin, first.origin);
    assert.equal(second.version, first.version);
  });

  it("restarts on a new revision and releases the old port", async () => {
    const first = await runtime.start(PROJECT_A, REVISION_A);
    const second = await runtime.start(PROJECT_A, REVISION_B);

    assert.notEqual(second.origin, first.origin);
    assert.match((await get(second.origin!, "/")).body, /A-V2/);
    // The old child is gone, not merely dereferenced.
    await assert.rejects(() => fetch(`${first.origin}/`), "old port should be released");
  });

  it("restarts on demand at the same revision", async () => {
    const first = await runtime.start(PROJECT_A, REVISION_A);
    const again = await runtime.restart(PROJECT_A);

    assert.equal(again.state, "ready");
    assert.ok(again.version > first.version);
    assert.equal((await get(again.origin!, "/")).status, 200);
  });

  it("stops deterministically and frees the port", async () => {
    const session = await runtime.start(PROJECT_A, REVISION_A);
    await runtime.stop(PROJECT_A);

    assert.equal(await runtime.status(PROJECT_A), null);
    await assert.rejects(() => fetch(`${session.origin}/`));
  });

  it("shutdown stops every child", async () => {
    const a = await runtime.start(PROJECT_A, REVISION_A);
    const b = await runtime.start(PROJECT_B, REVISION_A);

    await runtime.shutdown();

    for (const origin of [a.origin!, b.origin!]) {
      await assert.rejects(() => fetch(`${origin}/`), `${origin} should be closed`);
    }
  });
});

describe("sandboxed runtime isolation", () => {
  it("gives each project its own process, port and content", async () => {
    const a = await runtime.start(PROJECT_A, REVISION_A);
    const b = await runtime.start(PROJECT_B, REVISION_A);

    assert.notEqual(a.origin, b.origin);

    const fromA = await get(a.origin!, "/");
    const fromB = await get(b.origin!, "/");

    assert.match(fromA.body, /PROJECT-A-SECRET/);
    assert.match(fromB.body, /PROJECT-B-SECRET/);
    // The property that matters: neither can see the other's content.
    assert.doesNotMatch(fromA.body, /PROJECT-B-SECRET/);
    assert.doesNotMatch(fromB.body, /PROJECT-A-SECRET/);
  });

  it("does not let one project's preview serve another's files", async () => {
    const a = await runtime.start(PROJECT_A, REVISION_A);
    await runtime.start(PROJECT_B, REVISION_A);

    // Reach for B's directory from A's server, by every spelling of "up one".
    for (const attempt of [
      `/../${PROJECT_B}/index.html`,
      `/..%2f${PROJECT_B}%2findex.html`,
      `/%2e%2e/${PROJECT_B}/index.html`,
    ]) {
      const result = await get(a.origin!, attempt);
      assert.doesNotMatch(result.body, /PROJECT-B-SECRET/, `${attempt} crossed projects`);
    }
  });

  it("builds the child environment rather than inheriting it", () => {
    const env = previewEnvironment();

    // The direction matters: a denylist has to be updated whenever a secret is
    // added, and the once it is forgotten is the once that leaks. Nothing is
    // present here unless it was named.
    for (const secret of [
      "GENERATION_API_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY",
      "SUPABASE_URL",
      "WORKER_SECRET",
      "CRON_SECRET",
    ]) {
      assert.equal(env[secret], undefined, `${secret} must never reach a preview`);
    }

    assert.deepEqual(Object.keys(env).sort(), ["HOME", "NODE_ENV", "PATH", "TMPDIR"]);
  });

  it("carries no secret into a running preview, even when the parent has them", async () => {
    // Set on the parent for the duration of this test. If the child inherited
    // anything, this is what it would inherit.
    process.env.GENERATION_API_KEY = "sk-test-should-never-appear";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-should-never-appear";
    try {
      const session = await runtime.start(PROJECT_A, REVISION_A);
      const body = (await get(session.origin!, "/")).body;
      assert.doesNotMatch(body, /sk-test-should-never-appear/);
      assert.doesNotMatch(body, /service-role-should-never-appear/);
      assert.equal(session.state, "ready");
    } finally {
      delete process.env.GENERATION_API_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it("keeps host paths out of everything it reports", async () => {
    const session = await runtime.start(PROJECT_A, REVISION_A);
    const reported = JSON.stringify(session);

    assert.doesNotMatch(reported, new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(reported, /\/Users\/|\/home\//);
  });

  it("serves only from loopback", async () => {
    const session = await runtime.start(PROJECT_A, REVISION_A);
    assert.match(session.origin!, /^http:\/\/127\.0\.0\.1:\d+$/);
  });
});

describe("OS sandbox profile", () => {
  const capability = detectIsolation();

  it("denies writes and egress when an OS sandbox is available", { skip: capability.mode !== "sandboxed" }, () => {
    const profile = seatbeltProfile("/tmp/example");

    assert.match(profile, /\(deny file-write\*\)/);
    assert.match(profile, /\(deny network-outbound\)/);
    // But it must still be able to be a server.
    assert.match(profile, /\(allow network-bind \(local ip\)\)/);
  });

  it("states its limitations rather than implying none", () => {
    // The tier is only meaningful if the gaps are named alongside it.
    assert.ok(capability.guarantees.length > 0);
    assert.ok(capability.limitations.length > 0);
    assert.ok(capability.summary.length > 0);
  });

  it("never reports a tier it cannot provide", () => {
    // `container` is not implemented; claiming it would be exactly the
    // unevidenced security claim the isolation model exists to prevent.
    assert.notEqual(capability.mode, "container");
  });
});

describe("sandboxed runtime failure isolation", () => {
  it("reports a broken project as failed without throwing into the caller", async () => {
    const broken = makeRuntime({
      loadTree: async () => {
        throw new Error("store exploded");
      },
    });
    try {
      const session = await broken.start(PROJECT_A, REVISION_A);
      // A failure is a state, not an exception: the workspace has to be able
      // to render it.
      assert.equal(session.state, "failed");
      assert.ok(session.failure);
      assert.equal(session.origin, null);
    } finally {
      await broken.shutdown();
    }
  });

  it("survives a project with no HTML and explains why", async () => {
    const odd = makeRuntime({
      loadTree: async () => [file("notes.txt", "no pages here")],
    });
    try {
      const session = await odd.start(PROJECT_A, REVISION_A);
      assert.equal(session.state, "failed");
      assert.equal(session.failure?.stage, "unsupportedProject");
    } finally {
      await odd.shutdown();
    }
  });

  it("keeps one project's failure away from another's preview", async () => {
    const healthy = await runtime.start(PROJECT_B, REVISION_A);

    // A revision that does not exist: this project's preview fails.
    const failed = await runtime.start(PROJECT_A, asRevisionId("rev-missing"));
    assert.equal(failed.state, "failed");

    // The other project is untouched and still serving.
    const still = await get(healthy.origin!, "/");
    assert.equal(still.status, 200);
    assert.match(still.body, /PROJECT-B-SECRET/);
    assert.equal((await runtime.status(PROJECT_B))?.state, "ready");
  });

  it("notices a child that died and stops claiming to be ready", async () => {
    const session = await runtime.start(PROJECT_A, REVISION_A);
    assert.equal(session.state, "ready");

    // Kill it the way the OS would — behind the runtime's back.
    const port = Number(session.origin!.split(":").pop());
    process.kill(await pidListeningOn(port), "SIGKILL");

    // Give the exit handler a moment, then ask.
    await new Promise((r) => setTimeout(r, 400));
    const after = await runtime.status(PROJECT_A);
    assert.equal(after?.state, "failed", "a dead child must not read as ready");
    assert.equal(after?.failure?.stage, "crashed");
  });

  it("reports a missing server script rather than hanging", async () => {
    const broken = makeRuntime({ serverScript: join(base, "does-not-exist.mjs") });
    try {
      const session = await broken.start(PROJECT_A, REVISION_A);
      assert.equal(session.state, "failed");
      assert.equal(session.failure?.stage, "startup");
    } finally {
      await broken.shutdown();
    }
  });
});

describe("sandboxed runtime resource limits", () => {
  it("caps how many previews may run at once", async () => {
    const capped = makeRuntime();
    try {
      // One more than the cap, each a different project.
      const sessions = [];
      for (let i = 0; i <= PREVIEW_LIMITS.maxConcurrent; i++) {
        const id = asProjectId(`cccccccc-0000-0000-0000-${String(i).padStart(12, "0")}`);
        TREES.set(`${id}:${REVISION_A}`, [file("index.html", `<title>P${i}</title>`)]);
        sessions.push(await capped.start(id, REVISION_A));
      }

      const refused = sessions[sessions.length - 1];
      assert.equal(refused.state, "failed");
      assert.match(refused.failure?.message ?? "", /Too many previews/);
      // And the message tells someone what to do about it.
      assert.match(refused.failure?.detail ?? "", /limit/);
    } finally {
      await capped.shutdown();
    }
  });

  it("uses conservative defaults", () => {
    assert.ok(PREVIEW_LIMITS.maxOldSpaceMb <= 256, "memory ceiling should be modest");
    assert.ok(PREVIEW_LIMITS.maxConcurrent <= 16, "concurrency should be bounded");
    assert.ok(PREVIEW_LIMITS.maxLifetimeMs <= 4 * 60 * 60 * 1000, "lifetime should be bounded");
  });
});

/** Finds the pid listening on a port, so a test can kill a child the way the
 *  OS would rather than through the runtime's own API. */
async function pidListeningOn(port: number): Promise<number> {
  const { execFileSync } = await import("node:child_process");
  const output = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  const pid = Number(output.trim().split("\n")[0]);
  assert.ok(Number.isFinite(pid) && pid > 0, "expected a listening pid");
  return pid;
}

/** Materialised files are what the child serves; this checks the parent wrote
 *  them where it said and nowhere else. */
describe("materialised layout", () => {
  it("writes each project into its own directory", async () => {
    await runtime.start(PROJECT_A, REVISION_A);
    await runtime.start(PROJECT_B, REVISION_A);

    const a = await readFile(join(base, PROJECT_A, "index.html"), "utf8");
    const b = await readFile(join(base, PROJECT_B, "index.html"), "utf8");

    assert.match(a, /PROJECT-A-SECRET/);
    assert.match(b, /PROJECT-B-SECRET/);
  });

  it("clears the directory between revisions", async () => {
    await runtime.start(PROJECT_A, REVISION_A);
    // Revision A has about.html; revision B does not.
    await runtime.start(PROJECT_A, REVISION_B);

    await assert.rejects(
      () => readFile(join(base, PROJECT_A, "about.html"), "utf8"),
      "a file from the previous revision was left behind"
    );
  });

  it("does not write outside its own directory", async () => {
    await writeFile(join(base, "sentinel.txt"), "untouched", "utf8");
    await runtime.start(PROJECT_A, REVISION_A);
    assert.equal(await readFile(join(base, "sentinel.txt"), "utf8"), "untouched");
  });
});
