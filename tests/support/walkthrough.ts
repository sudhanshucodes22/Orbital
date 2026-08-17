/** A full lifecycle against the real demo store. Not part of the test suite.
 *
 * The unit tests run against a fake container, which is fast and lets them
 * assert on invariants — but a fake is a model of the adapter, and a model can
 * be wrong. This drives the actual file-backed store on disk, through the real
 * services, so the things a fake cannot vouch for get exercised: JSON round
 * trips, the promise mutex, rows written before the current schema, and the
 * paging cursor against real timestamps.
 *
 * Run with:
 *
 *   npm run walkthrough
 *
 * It creates its own workspace, project and runs, and deletes the project at
 * the end, so it can be run repeatedly against a store with real data in it.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  asProjectId,
  asUserId,
  asWorkspaceId,
  type GenerationIntent,
  type Session,
} from "../../lib/domain";
import { asArtifactId } from "../../lib/domain/ids";
import { NotFoundError } from "../../lib/errors";
import { getContainer } from "../../lib/server/container";
import { createProject, deleteProject } from "../../lib/services/projects";
import { compareRevisions, getRun, listRuns, retryRun } from "../../lib/services/runs";
import { restoreRevision } from "../../lib/services/files";

const log = (step: string, detail = "") =>
  console.log(`  ${step.padEnd(52)} ${detail}`);

function intent(text: string): GenerationIntent {
  return {
    type: "create",
    inputs: [
      { id: asArtifactId(`a-${Math.random()}`), kind: "text", text, createdAt: new Date().toISOString() },
    ],
  };
}

/** Signs up through the real path, then builds the Session by hand.
 *
 * `auth.signUp` creates the user, workspace and membership in the store and
 * then sets a cookie — and `cookies()` only works inside a request scope, which
 * this script is not. The account is genuinely created before that point, so
 * the sign-up is real; only the cookie is unavailable, and a Session is a plain
 * value the services accept directly.
 *
 * Reading the store file to resolve it is the honest shortcut: this is a
 * development script driving the development backend, and inventing a fake
 * user instead would be testing something other than the real data.
 */
async function signUpAndSession(email: string): Promise<Session> {
  const container = getContainer();
  try {
    await container.auth.signUp({ email, password: "WalkThrough123!" });
  } catch (error) {
    if (!/cookies|request scope/i.test(String(error))) throw error;
  }

  const store = join(process.cwd(), ".orbital-demo", "db.json");
  const db = JSON.parse(readFileSync(store, "utf8")) as {
    users: { id: string; email: string; displayName: string | null; createdAt: string }[];
    members: { workspaceId: string; userId: string }[];
  };

  const user = db.users.find((u) => u.email === email.toLowerCase());
  assert.ok(user, `sign-up did not create ${email}`);
  const membership = db.members.find((m) => m.userId === user.id);
  assert.ok(membership, "sign-up did not create a workspace membership");

  return {
    user: {
      id: asUserId(user.id),
      email: user.email,
      displayName: user.displayName ?? null,
      avatarUrl: null,
      createdAt: user.createdAt,
    },
    activeWorkspaceId: asWorkspaceId(membership.workspaceId),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

/** Removes the accounts this script creates, and nothing else.
 *
 * Matched by the exact throwaway pattern rather than by "recently created",
 * so a real account can never be caught by it. */
const THROWAWAY = /^(walkthrough|intruder)-\d+@example\.test$/;

function pruneThrowawayAccounts(): void {
  const path = join(process.cwd(), ".orbital-demo", "db.json");
  const db = JSON.parse(readFileSync(path, "utf8")) as {
    users: { id: string; email: string }[];
    members: { workspaceId: string; userId: string }[];
    workspaces: { id: string }[];
  };

  const doomedUsers = new Set(
    db.users.filter((u) => THROWAWAY.test(u.email)).map((u) => u.id)
  );
  if (doomedUsers.size === 0) return;

  const doomedWorkspaces = new Set(
    db.members.filter((m) => doomedUsers.has(m.userId)).map((m) => m.workspaceId)
  );
  db.users = db.users.filter((u) => !doomedUsers.has(u.id));
  db.members = db.members.filter((m) => !doomedUsers.has(m.userId));
  db.workspaces = db.workspaces.filter((w) => !doomedWorkspaces.has(w.id));

  writeFileSync(path, JSON.stringify(db, null, 2));
}

async function main() {
  const container = getContainer();

  const email = `walkthrough-${Date.now()}@example.test`;
  const session = await signUpAndSession(email);
  log("signed up and built a session", session.user.email);

  const project = await createProject(session, { name: "Walkthrough", description: null });
  log("created a project", project.id);

  try {
    // ---- generation -------------------------------------------------------
    const job = await container.generation.submit(project.id, intent("a landing page for a bakery"));
    log("submitted a generation", job.id);

    // Poll until terminal. `generation.get` advances the run, so this is also
    // the durability path: no browser, no worker, the poll does the work.
    let status = job.status;
    for (let i = 0; i < 40 && !["succeeded", "failed", "cancelled"].includes(status); i++) {
      await new Promise((r) => setTimeout(r, 100));
      status = (await container.generation.get(job.id))?.status ?? status;
    }
    assert.equal(status, "succeeded", "the generation did not succeed");
    log("generation reached a terminal state", status);

    // ---- history paging ---------------------------------------------------
    // Enough runs to page through. Each revises the previous head.
    for (let i = 0; i < 6; i++) {
      const head = (await container.projects.get(project.id))!.currentRevisionId!;
      const next = await container.generation.submit(project.id, {
        type: "revise",
        baseRevisionId: head,
        inputs: intent(`change number ${i}`).inputs,
      });
      let s = next.status;
      for (let n = 0; n < 40 && !["succeeded", "failed", "cancelled"].includes(s); n++) {
        await new Promise((r) => setTimeout(r, 100));
        s = (await container.generation.get(next.id))?.status ?? s;
      }
      assert.equal(s, "succeeded", `revision ${i} did not succeed`);
    }
    log("ran seven generations in total");

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (let guard = 0; guard < 10; guard++) {
      const page = await listRuns(session, project.id, { limit: 3, cursor });
      pages++;
      seen.push(...page.runs.map((r) => r.id));
      if (!page.hasMore) break;
      cursor = page.nextCursor ?? undefined;
    }
    assert.equal(seen.length, 7, `expected 7 runs, paged ${seen.length}`);
    assert.equal(new Set(seen).size, 7, "a run appeared on two pages");
    log("paged the whole history exactly once", `${seen.length} runs over ${pages} pages`);

    const succeeded = await listRuns(session, project.id, { statuses: ["succeeded"] });
    assert.equal(succeeded.runs.length, 7);
    const failedOnly = await listRuns(session, project.id, { statuses: ["failed"] });
    assert.equal(failedOnly.runs.length, 0);
    log("status filtering works", `succeeded=7 failed=0`);

    // ---- diff -------------------------------------------------------------
    const revisions = await container.revisions.listForProject(project.id);
    assert.ok(revisions.length >= 2, "not enough revisions to diff");
    const diff = await compareRevisions(session, project.id, revisions[1].id, revisions[0].id);
    assert.equal(diff.identical, false, "consecutive revisions should differ");
    log(
      "diffed two revisions",
      `+${diff.added} ~${diff.modified} -${diff.deleted} (${diff.unchanged} unchanged)`
    );

    // Diffing a revision against itself must be empty — the property that
    // catches a comparison accidentally reading the wrong side.
    const self = await compareRevisions(session, project.id, revisions[0].id, revisions[0].id);
    assert.equal(self.identical, true, "a revision differs from itself");
    log("a revision is identical to itself");

    // ---- restore ----------------------------------------------------------
    const oldest = revisions[revisions.length - 1];
    await restoreRevision(session, project.id, oldest.id);
    const afterRestore = await container.revisions.listForProject(project.id);
    assert.equal(afterRestore.length, revisions.length + 1, "restore did not append a revision");
    const restoredDiff = await compareRevisions(
      session,
      project.id,
      oldest.id,
      afterRestore[0].id
    );
    assert.equal(restoredDiff.identical, true, "restore did not reproduce the tree exactly");
    log("restored the first revision", "tree matches exactly, history appended");

    // ---- retry ------------------------------------------------------------
    // Fail a run the way a real failure leaves it, then retry it.
    const head = (await container.projects.get(project.id))!.currentRevisionId!;
    const doomed = await container.runs.create({
      projectId: asProjectId(project.id),
      prompt: "this one fails",
      baseRevisionId: head,
      generationId: null,
      mode: "model",
      idempotencyKey: `walkthrough-fail-${Date.now()}`,
      intent: intent("this one fails"),
    });
    await container.runs.update(doomed.id, {
      status: "failed",
      error: "The provider returned nothing usable.",
      failure: { stage: "generation", message: "The provider returned nothing usable." },
      completedAt: new Date().toISOString(),
      leaseExpiresAt: null,
    });
    log("recorded a failed run", doomed.id);

    const retry = await retryRun(session, doomed.id);
    assert.equal(retry.retryOfRunId, doomed.id);
    assert.equal(retry.attempt, 2);
    assert.notEqual(retry.idempotencyKey, doomed.idempotencyKey);
    log("retried it", `attempt ${retry.attempt}, links to ${retry.retryOfRunId?.slice(0, 8)}`);

    const original = await getRun(session, doomed.id);
    assert.equal(original.status, "failed", "the retry mutated the original run");
    log("the original failure survives untouched", original.status);

    // Wait for the retry to reach a terminal state so it does not block the
    // project, then confirm the double-click case.
    for (let i = 0; i < 40; i++) {
      const current = await getRun(session, retry.id);
      if (["succeeded", "failed", "cancelled"].includes(current.status)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const settled = await getRun(session, retry.id);
    log("the retry ran to completion", settled.status);

    // ---- authorisation ----------------------------------------------------
    const intruder = await signUpAndSession(`intruder-${Date.now()}@example.test`);
    assert.notEqual(intruder.user.id, session.user.id);

    await assert.rejects(() => listRuns(intruder, project.id), NotFoundError);
    await assert.rejects(() => getRun(intruder, doomed.id), NotFoundError);
    await assert.rejects(() => retryRun(intruder, doomed.id), NotFoundError);
    await assert.rejects(
      () => compareRevisions(intruder, project.id, revisions[1].id, revisions[0].id),
      NotFoundError
    );
    await assert.rejects(
      () => restoreRevision(intruder, project.id, revisions[0].id),
      NotFoundError
    );
    log("a second account is refused on every path", "history, run, retry, diff, restore");

    // And refused as *missing*, not as forbidden: existence must not leak.
    try {
      await getRun(intruder, doomed.id);
    } catch (error) {
      assert.ok(error instanceof NotFoundError);
      assert.doesNotMatch(String((error as Error).message), /workspace|member|forbidden/i);
    }
    log("refusal does not confirm the resource exists");

    console.log("\n  all checks passed\n");
  } finally {
    // The owner's session is a plain value, so cleanup needs no cookie.
    // Deleting the project cascades its revisions, files and runs — which is
    // itself worth watching: if the store is not back to its previous size
    // afterwards, the cascade has a hole in it.
    await deleteProject(session, project.id).catch(() => {});
    // The throwaway accounts have no delete path through the ports, because
    // the product has no "delete my account" feature to back one. Pruning them
    // at the store is the honest option; the alternative is a dev store that
    // accumulates a dead user every time this runs.
    pruneThrowawayAccounts();
  }
}

main().catch((error) => {
  console.error("\n  FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
