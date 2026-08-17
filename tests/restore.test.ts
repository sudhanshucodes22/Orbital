/** Restoring a revision.
 *
 * The property under test: restoring is a jump to a frozen tree, not a replay.
 * Three revisions deep, restoring the first must reproduce it exactly — and
 * must do so without depending on anything that happened in between.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { asRevisionId, type GenerationIntent, type InputArtifact } from "../lib/domain";
import { asArtifactId } from "../lib/domain/ids";
import { NotFoundError, ValidationError } from "../lib/errors";
import { __setContainer } from "../lib/server/container";
import { __setModelProvider } from "../lib/server/ai/registry";
import { advance, createPipelineEngine } from "../lib/server/pipeline/pipeline";
import type { OperationProducer } from "../lib/server/pipeline/types";
import { restoreRevision } from "../lib/services/files";
import { fakeContainer, ownerSession, PROJECT_ID, type FakeState } from "./support/fake-container";

const NO_KICK = { autoStart: false };

function intent(text: string): GenerationIntent {
  const inputs: InputArtifact[] = [
    { id: asArtifactId("a1"), kind: "text", text, createdAt: new Date().toISOString() },
  ];
  return { type: "create", inputs };
}

function producer(operations: unknown[]): OperationProducer {
  return {
    mode: "model",
    async produce() {
      return {
        operations: operations as never,
        plan: {
          intent: "modify" as const,
          summary: "change",
          steps: [{ id: "s", title: "t", action: "update" as const, targets: [], rationale: null }],
          isInitialBuild: false,
          dependencies: [],
          configChanges: [],
          validation: [],
          notes: null,
        },
        model: null,
      };
    },
  };
}

/** Runs one generation to completion. */
async function generate(state: FakeState, ops: unknown[], prompt: string) {
  const p = producer(ops);
  const engine = createPipelineEngine(p, NO_KICK);
  await engine.submit(PROJECT_ID, intent(prompt));
  const queued = state.runs.filter((r) => r.status === "queued");
  await advance(queued[queued.length - 1].id, p);
}

function treeOf(state: FakeState): Record<string, string> {
  return Object.fromEntries(state.files.map((f) => [f.path, f.content ?? ""]));
}

describe("restoreRevision", () => {
  let state: FakeState;

  beforeEach(() => {
    const fake = fakeContainer();
    state = fake.state;
    __setContainer(fake.container);
    __setModelProvider(null);
  });

  it("restores an earlier tree exactly, without replaying history", async () => {
    await generate(state, [{ kind: "createFile", path: "index.html", content: "v1" }], "one");
    const revision1 = state.revisions[0];
    const tree1 = treeOf(state);

    await generate(
      state,
      [
        { kind: "updateFile", path: "index.html", content: "v2" },
        { kind: "createFile", path: "about.html", content: "about" },
      ],
      "two"
    );
    await generate(state, [{ kind: "deleteFile", path: "about.html" }], "three");

    assert.equal(state.revisions.length, 3);
    assert.notDeepEqual(treeOf(state), tree1);

    const restored = await restoreRevision(ownerSession(), PROJECT_ID, revision1.id);

    // Exactly revision 1 — same paths, same contents.
    assert.deepEqual(treeOf(state), tree1);
    assert.deepEqual(Object.keys(treeOf(state)), ["index.html"]);
    assert.equal(state.files[0].content, "v1");

    // Recorded as a new revision rather than by rewinding a pointer, so the
    // restore is itself undoable and history stays append-only.
    assert.equal(state.revisions.length, 4);
    assert.equal(state.project.currentRevisionId, restored.id);
    assert.equal(restored.parentId, state.revisions[2].id);
    assert.match(restored.summary, /Restored revision/);
  });

  it("removes files added after the restored revision", async () => {
    await generate(state, [{ kind: "createFile", path: "index.html", content: "v1" }], "one");
    const first = state.revisions[0];
    await generate(state, [{ kind: "createFile", path: "extra.html", content: "extra" }], "two");

    assert.equal(state.files.length, 2);
    await restoreRevision(ownerSession(), PROJECT_ID, first.id);
    assert.deepEqual(state.files.map((f) => f.path), ["index.html"]);
  });

  it("can restore the restore, returning to the later state", async () => {
    await generate(state, [{ kind: "createFile", path: "index.html", content: "v1" }], "one");
    const first = state.revisions[0];
    await generate(state, [{ kind: "updateFile", path: "index.html", content: "v2" }], "two");
    const second = state.revisions[1];

    await restoreRevision(ownerSession(), PROJECT_ID, first.id);
    assert.equal(state.files[0].content, "v1");

    await restoreRevision(ownerSession(), PROJECT_ID, second.id);
    assert.equal(state.files[0].content, "v2");
  });

  it("refuses a revision id that does not exist", async () => {
    await assert.rejects(
      () => restoreRevision(ownerSession(), PROJECT_ID, asRevisionId("nope")),
      (e: unknown) => e instanceof NotFoundError
    );
  });

  it("refuses a revision with no frozen tree rather than restoring an empty project", async () => {
    await generate(state, [{ kind: "createFile", path: "index.html", content: "v1" }], "one");
    // A revision written before tree snapshots existed.
    const legacy = { ...state.revisions[0], id: asRevisionId("legacy"), tree: undefined };
    state.revisions.push(legacy);

    await assert.rejects(
      () => restoreRevision(ownerSession(), PROJECT_ID, asRevisionId("legacy")),
      (e: unknown) => e instanceof ValidationError && /cannot be restored/.test((e as Error).message)
    );
    // The project is untouched.
    assert.equal(state.files[0].content, "v1");
  });
});
