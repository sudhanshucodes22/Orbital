/** The preview service — authorisation and revision selection.
 *
 * The service owns *which* revision gets previewed and *whether the caller may
 * see it*. The runtime owns execution, and has its own tests that bind real
 * ports. These use a fake runtime deliberately: a test about authorisation
 * should fail for authorisation reasons, not because a socket did not bind.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { asRevisionId, asUserId, asWorkspaceId, type Session } from "../lib/domain";
import { NotFoundError } from "../lib/errors";
import { __setContainer } from "../lib/server/container";
import {
  getPreviewStatus,
  getPreviewTarget,
  restartPreview,
  stopPreview,
} from "../lib/services/preview";
import { fakeContainer, ownerSession, PROJECT_ID, type FakeState } from "./support/fake-container";

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
  __setContainer(fake.container);
});

function addRevision(id: string) {
  state.revisions.unshift({
    id: asRevisionId(id),
    projectId: PROJECT_ID,
    parentId: null,
    generationId: null,
    summary: "a revision",
    site: { pages: [], assets: [], tokens: {}, generatedAt: new Date().toISOString() } as never,
    tree: [],
    createdAt: new Date().toISOString(),
  });
  state.project = { ...state.project, currentRevisionId: asRevisionId(id) };
}

describe("getPreviewTarget", () => {
  it("invites a build when the project has no revision, without starting a runtime", async () => {
    const target = await getPreviewTarget(ownerSession(), PROJECT_ID);

    assert.equal(target.kind, "unavailable");
    if (target.kind !== "unavailable") return;
    assert.equal(target.because, "no-revision");
    assert.ok(target.reason.length > 0);
    // Nothing to preview means nothing should be spun up — a port and a
    // directory for a project with no files is pure waste.
    assert.equal(state.previewCalls.length, 0);
  });

  it("starts the runtime at the project's head revision", async () => {
    addRevision("rev-1");
    const target = await getPreviewTarget(ownerSession(), PROJECT_ID);

    assert.equal(target.kind, "runtime");
    if (target.kind !== "runtime") return;
    assert.equal(target.state, "ready");
    assert.equal(target.revisionId, "rev-1");
    assert.deepEqual(state.previewCalls, [{ call: "start", revisionId: "rev-1" }]);
  });

  it("builds page URLs from the origin the runtime reported", async () => {
    addRevision("rev-1");
    const target = await getPreviewTarget(ownerSession(), PROJECT_ID);

    assert.equal(target.kind, "runtime");
    if (target.kind !== "runtime") return;
    assert.equal(target.url, "http://127.0.0.1:41234/");
    assert.deepEqual(
      target.pages.map((p) => p.url),
      ["http://127.0.0.1:41234/"]
    );
  });

  it("does not restart a healthy preview on a repeat call", async () => {
    addRevision("rev-1");
    const first = await getPreviewTarget(ownerSession(), PROJECT_ID);
    const second = await getPreviewTarget(ownerSession(), PROJECT_ID);

    assert.equal(first.kind === "runtime" && first.version, "rev-1:1");
    // Same version: polling must not cycle the runtime under someone.
    assert.equal(second.kind === "runtime" && second.version, "rev-1:1");
  });

  it("follows the head when a generation creates a new revision", async () => {
    addRevision("rev-1");
    const before = await getPreviewTarget(ownerSession(), PROJECT_ID);

    addRevision("rev-2");
    const after = await getPreviewTarget(ownerSession(), PROJECT_ID);

    assert.equal(before.kind === "runtime" && before.revisionId, "rev-1");
    assert.equal(after.kind === "runtime" && after.revisionId, "rev-2");
    // The version changes too, which is what tells a client to reload rather
    // than keep showing the previous build.
    assert.notEqual(
      before.kind === "runtime" && before.version,
      after.kind === "runtime" && after.version
    );
  });

  it("passes a runtime failure through with its reason intact", async () => {
    addRevision("rev-1");
    state.previewFails = true;

    const target = await getPreviewTarget(ownerSession(), PROJECT_ID);
    assert.equal(target.kind, "runtime");
    if (target.kind !== "runtime") return;
    assert.equal(target.state, "failed");
    assert.equal(target.url, null);
    assert.equal(target.failure?.stage, "startup");
    assert.ok(target.failure?.message);
  });

  it("refuses a project the caller does not own, before starting anything", async () => {
    addRevision("rev-1");
    await assert.rejects(() => getPreviewTarget(strangerSession(), PROJECT_ID), NotFoundError);
    // The authorisation check has to come first: a refused caller must not be
    // able to make the host start a runtime.
    assert.equal(state.previewCalls.length, 0);
  });
});

describe("getPreviewStatus", () => {
  it("returns null when nothing is running", async () => {
    assert.equal(await getPreviewStatus(ownerSession(), PROJECT_ID), null);
  });

  it("reports a running preview without starting one", async () => {
    addRevision("rev-1");
    await getPreviewTarget(ownerSession(), PROJECT_ID);
    state.previewCalls.length = 0;

    const status = await getPreviewStatus(ownerSession(), PROJECT_ID);
    assert.equal(status?.kind, "runtime");
    assert.deepEqual(state.previewCalls, [{ call: "status", revisionId: null }]);
  });

  it("refuses a stranger", async () => {
    addRevision("rev-1");
    await getPreviewTarget(ownerSession(), PROJECT_ID);
    await assert.rejects(() => getPreviewStatus(strangerSession(), PROJECT_ID), NotFoundError);
  });
});

describe("restartPreview", () => {
  it("restarts a running preview and bumps the version", async () => {
    addRevision("rev-1");
    const before = await getPreviewTarget(ownerSession(), PROJECT_ID);
    const after = await restartPreview(ownerSession(), PROJECT_ID);

    assert.equal(after.kind, "runtime");
    assert.notEqual(
      before.kind === "runtime" && before.version,
      after.kind === "runtime" && after.version
    );
  });

  it("starts one when there is nothing to restart", async () => {
    addRevision("rev-1");
    // The button should do the obvious thing rather than report an error
    // about internal state.
    const target = await restartPreview(ownerSession(), PROJECT_ID);
    assert.equal(target.kind, "runtime");
    assert.equal(target.kind === "runtime" && target.state, "ready");
  });

  it("refuses a stranger", async () => {
    addRevision("rev-1");
    await getPreviewTarget(ownerSession(), PROJECT_ID);
    await assert.rejects(() => restartPreview(strangerSession(), PROJECT_ID), NotFoundError);
  });
});

describe("stopPreview", () => {
  it("stops a running preview", async () => {
    addRevision("rev-1");
    await getPreviewTarget(ownerSession(), PROJECT_ID);

    await stopPreview(ownerSession(), PROJECT_ID);
    assert.equal(await getPreviewStatus(ownerSession(), PROJECT_ID), null);
  });

  it("refuses a stranger", async () => {
    addRevision("rev-1");
    await getPreviewTarget(ownerSession(), PROJECT_ID);
    await assert.rejects(() => stopPreview(strangerSession(), PROJECT_ID), NotFoundError);
    // And the preview is still running — a refused call must have no effect.
    assert.notEqual(await getPreviewStatus(ownerSession(), PROJECT_ID), null);
  });
});
