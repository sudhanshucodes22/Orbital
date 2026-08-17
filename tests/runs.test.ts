/** Retry, history paging and the authorisation around both.
 *
 * The properties under test:
 *
 *   - a retry never edits the run it retries; history stays append-only
 *   - retrying twice produces one retry, not two
 *   - a retry cannot start while something else is running
 *   - one user cannot read, compare or retry another user's runs
 *   - paging returns every run exactly once, with no gaps and no repeats
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  asProjectId,
  asRevisionId,
  asUserId,
  asWorkspaceId,
  type GenerationIntent,
  type GenerationRun,
  type Session,
} from "../lib/domain";
import { asArtifactId } from "../lib/domain/ids";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { __setContainer } from "../lib/server/container";
import { compareRevisions, getRun, listRuns, retryRun } from "../lib/services/runs";
import { fakeContainer, ownerSession, PROJECT_ID, type FakeState } from "./support/fake-container";

function intent(text: string): GenerationIntent {
  return {
    type: "create",
    inputs: [
      { id: asArtifactId("a1"), kind: "text", text, createdAt: new Date().toISOString() },
    ],
  };
}

/** A signed-in user who owns nothing in the fake container. */
function strangerSession(): Session {
  return {
    user: {
      id: asUserId("user-2"),
      email: "stranger@example.com",
      displayName: null,
      avatarUrl: null,
      createdAt: new Date().toISOString(),
    },
    activeWorkspaceId: asWorkspaceId("ws-2"),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

let state: FakeState;

beforeEach(() => {
  const fake = fakeContainer();
  state = fake.state;
  // The kick is fire-and-forget and guarded; a no-op keeps these tests about
  // what retry *records*, which is the part that has to be right.
  (fake.container.generation as { get: unknown }).get = async () => null;
  __setContainer(fake.container);
});

/** Puts a failed run in the store, the way a real failure would leave one. */
async function failedRun(prompt = "build me a site"): Promise<GenerationRun> {
  const run = await state && (await seed(prompt, "failed"));
  return run;
}

async function seed(prompt: string, status: GenerationRun["status"]): Promise<GenerationRun> {
  const { runs } = await import("../lib/server/container").then((m) => m.getContainer());
  const created = await runs.create({
    projectId: PROJECT_ID,
    prompt,
    baseRevisionId: null,
    generationId: null,
    mode: "model",
    idempotencyKey: `key-${prompt}-${state.runs.length}`,
    intent: intent(prompt),
  });
  // Drive it straight to a terminal state; the pipeline's own path is covered
  // by pipeline.test.ts, and what matters here is the row a retry reads.
  return runs.update(created.id, {
    status,
    error: status === "failed" ? "The model returned nothing usable." : null,
    completedAt: new Date().toISOString(),
    leaseExpiresAt: null,
  });
}

describe("retryRun", () => {
  it("creates a new run and leaves the failed one untouched", async () => {
    const original = await failedRun();
    const retry = await retryRun(ownerSession(), original.id);

    assert.notEqual(retry.id, original.id);
    assert.equal(retry.retryOfRunId, original.id);
    assert.equal(retry.attempt, 2);
    assert.equal(retry.status, "queued");
    assert.equal(retry.prompt, original.prompt);

    // The failure is still there, still a failure. History is a record.
    const stillFailed = await getRun(ownerSession(), original.id);
    assert.equal(stillFailed.status, "failed");
    assert.equal(stillFailed.error, "The model returned nothing usable.");
  });

  it("collapses a double-clicked retry into one run", async () => {
    const original = await failedRun();

    // Sequential rather than Promise.all: this is the double-click, and the
    // second click genuinely arrives after the first has written a row.
    const first = await retryRun(ownerSession(), original.id);
    const second = await retryRun(ownerSession(), original.id);

    assert.equal(second.id, first.id);
    assert.equal(state.runs.filter((r) => r.retryOfRunId === original.id).length, 1);
  });

  it("refuses to retry a run that did not fail", async () => {
    const succeeded = await seed("worked fine", "succeeded");
    await assert.rejects(() => retryRun(ownerSession(), succeeded.id), ValidationError);
  });

  it("refuses while another generation is in flight", async () => {
    const original = await failedRun();
    await seed("something else", "running");

    await assert.rejects(() => retryRun(ownerSession(), original.id), ConflictError);
  });

  it("points a retry of a retry at the original failure", async () => {
    const original = await failedRun();
    const firstRetry = await retryRun(ownerSession(), original.id);

    // Let the first retry fail too.
    const { runs } = await import("../lib/server/container").then((m) => m.getContainer());
    await runs.update(firstRetry.id, {
      status: "failed",
      error: "again",
      completedAt: new Date().toISOString(),
      leaseExpiresAt: null,
    });

    const secondRetry = await retryRun(ownerSession(), firstRetry.id);

    // The lineage root, not a chain: attempt 3 still points at attempt 1.
    assert.equal(secondRetry.retryOfRunId, original.id);
    assert.equal(secondRetry.attempt, 3);
    assert.notEqual(secondRetry.id, firstRetry.id);
  });

  it("gives the retry an idempotency key of its own", async () => {
    const original = await failedRun();
    const retry = await retryRun(ownerSession(), original.id);

    // If they collided, the retry would have silently resolved to the failed
    // run instead of starting anything — the exact bug the attempt number in
    // the key exists to prevent.
    assert.notEqual(retry.idempotencyKey, original.idempotencyKey);
  });
});

describe("run authorisation", () => {
  it("does not let a stranger read a run", async () => {
    const run = await failedRun();
    await assert.rejects(() => getRun(strangerSession(), run.id), NotFoundError);
  });

  it("does not let a stranger retry a run", async () => {
    const run = await failedRun();
    await assert.rejects(() => retryRun(strangerSession(), run.id), NotFoundError);

    // And nothing was created as a side effect of trying.
    assert.equal(state.runs.filter((r) => r.retryOfRunId).length, 0);
  });

  it("does not let a stranger list a project's history", async () => {
    await failedRun();
    await assert.rejects(() => listRuns(strangerSession(), PROJECT_ID), NotFoundError);
  });

  it("reports a missing run as missing rather than as an authorisation error", async () => {
    await assert.rejects(() => getRun(ownerSession(), "no-such-run"), NotFoundError);
  });

  it("refuses to compare a revision belonging to another project", async () => {
    state.revisions.push({
      id: asRevisionId("rev-elsewhere"),
      // Someone else's project, paired with an id from this one.
      projectId: asProjectId("proj-2"),
      parentId: null,
      generationId: null,
      summary: "not yours",
      site: { pages: [], tokens: {} } as never,
      tree: [],
      createdAt: new Date().toISOString(),
    });
    state.revisions.push({
      id: asRevisionId("rev-mine"),
      projectId: PROJECT_ID,
      parentId: null,
      generationId: null,
      summary: "mine",
      site: { pages: [], tokens: {} } as never,
      tree: [],
      createdAt: new Date().toISOString(),
    });

    await assert.rejects(
      () =>
        compareRevisions(
          ownerSession(),
          PROJECT_ID,
          asRevisionId("rev-elsewhere"),
          asRevisionId("rev-mine")
        ),
      NotFoundError
    );
  });
});

describe("history paging", () => {
  beforeEach(async () => {
    for (let i = 0; i < 25; i++) await seed(`run ${i}`, "succeeded");
  });

  it("returns newest first", async () => {
    const page = await listRuns(ownerSession(), PROJECT_ID, { limit: 3 });
    assert.deepEqual(
      page.runs.map((r) => r.prompt),
      ["run 24", "run 23", "run 22"]
    );
  });

  it("walks the whole history exactly once", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;

    for (let guard = 0; guard < 20; guard++) {
      const page = await listRuns(ownerSession(), PROJECT_ID, { limit: 4, cursor });
      seen.push(...page.runs.map((r) => r.id));
      if (!page.hasMore) break;
      cursor = page.nextCursor ?? undefined;
    }

    assert.equal(seen.length, 25);
    assert.equal(new Set(seen).size, 25, "a run appeared on two pages");
  });

  it("reports hasMore from evidence, not from a length comparison", async () => {
    // Exactly the page size remaining is the case a naive `length === limit`
    // check gets wrong.
    const page = await listRuns(ownerSession(), PROJECT_ID, { limit: 25 });
    assert.equal(page.runs.length, 25);
    assert.equal(page.hasMore, false);
    assert.equal(page.nextCursor, null);
  });

  it("filters by status", async () => {
    await seed("the bad one", "failed");
    const page = await listRuns(ownerSession(), PROJECT_ID, { statuses: ["failed"] });

    assert.equal(page.runs.length, 1);
    assert.equal(page.runs[0].prompt, "the bad one");
  });

  it("clamps an absurd page size instead of honouring it", async () => {
    // The limit ultimately comes from a URL parameter; an unbounded one is a
    // way to ask the database for everything.
    const page = await listRuns(ownerSession(), PROJECT_ID, { limit: 100_000 });
    assert.ok(page.runs.length <= 50);
  });
});
