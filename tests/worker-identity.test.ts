/** Run execution never borrows the caller's request-scoped identity.
 *
 * ## The bug this exists for
 *
 * `submit` kicks work off with an unawaited `void advance(...)`, deliberately:
 * that is what makes a run start without waiting for a poll, while staying
 * durable if the request dies. But `advance` resolved `getContainer()`, whose
 * Supabase adapters build their client from `cookies()`. The kick outlives the
 * request that made it, so by the time `advance` reached the database the
 * request scope was gone and Next.js threw:
 *
 *     `cookies` was called outside a request scope
 *
 * Every Supabase generation failed this way, at the persistence stage, having
 * never called the model. Demo mode could not show it: its file-backed
 * adapters need no request scope, so 378 tests passed over the top of it.
 *
 * There were two halves to the fix, and this file guards both:
 *
 *   1. `advance` runs under `getWorkerContainer()`.
 *   2. `getWorkerContainer()` swaps *every* Supabase-backed repository, not
 *      just files/revisions/runs. It had been missing `projects` and
 *      `workspaces`, which execution reads to build project context.
 *
 * Half 2 is the one that will rot: the next repository added to the container
 * will be request-scoped by default, and nothing else would notice.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { __setContainer, getContainer, getWorkerContainer } from "../lib/server/container";

/** Ports whose Supabase adapter reads or writes rows through a client, and so
 *  must come from the service role when there is no session to build one. */
const ROW_BACKED = ["projects", "workspaces", "files", "revisions", "runs"] as const;

const SUPABASE_ENV = {
  SUPABASE_URL: "https://worker-identity.test.invalid",
  SUPABASE_ANON_KEY: "anon-key-for-the-mode-switch",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-for-the-mode-switch",
};

/** Builds both containers under a given environment.
 *
 * `getContainer` memoises and picks the demo/Supabase branch on first call, so
 * the cache is cleared through the seam the suite already uses rather than by
 * reloading the module. Neither branch touches the network or reads a key at
 * construction time, so placeholder credentials are enough to select one.
 */
function containersUnder(env: Record<string, string>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  __setContainer(null);
  try {
    return { request: getContainer(), worker: getWorkerContainer() };
  } finally {
    for (const key of Object.keys(env)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    __setContainer(null);
  }
}

test("the worker container swaps every row-backed repository", () => {
  const { request, worker } = containersUnder(SUPABASE_ENV);

  assert.notEqual(
    request.projects,
    worker.projects,
    "projects came straight from the request container, so executing a run " +
      "would resolve a cookie client outside any request"
  );

  for (const port of ROW_BACKED) {
    assert.notEqual(
      request[port],
      worker[port],
      `${port} is shared with the request container. Every Supabase-backed ` +
        `repository must be re-created against the service role for the ` +
        `worker, because run execution has no session.`
    );
  }
});

test("demo mode reuses one set of adapters", () => {
  // Demo mode has no row-level security and no request-scoped client, so the
  // two containers being the same object is correct rather than an oversight.
  // Asserted so the swap above is understood as Supabase-specific.
  const { request, worker } = containersUnder({});
  assert.equal(worker, request);
});

test("advance executes under the worker container", () => {
  // A source check, because the distinction only exists in Supabase mode and
  // the suite runs in demo mode, where both containers are the same object —
  // a behavioural assertion here would pass no matter which one it called.
  const source = readFileSync(
    join(process.cwd(), "lib/server/pipeline/pipeline.ts"),
    "utf8"
  );
  const body = source.slice(source.indexOf("export async function advance("));
  const resolved = /const container = (getWorkerContainer|getContainer)\(\)/.exec(body);

  assert.ok(resolved, "advance() no longer resolves a container in the expected shape");
  assert.equal(
    resolved[1],
    "getWorkerContainer",
    "advance() resolves the request container. It is called from an unawaited " +
      "kick in submit(), from a poll and from the worker process; only one of " +
      "those has a request scope, and only briefly."
  );
});
