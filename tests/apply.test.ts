/** The operation applier — the security boundary.
 *
 * Pure, so it can be tested exhaustively with no store, session or container.
 * That is the payoff for extracting it out of the service layer.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyOperationsToTree, treeAfter } from "../lib/domain/apply";
import { byteLength, hashContent, type FileSnapshot } from "../lib/domain/file";
import type { FileOperation } from "../lib/domain/operation";

function snapshot(path: string, content: string): FileSnapshot {
  return {
    path,
    kind: "text",
    content,
    storageKey: null,
    hash: hashContent(content),
    byteSize: byteLength(content),
  };
}

const tree = [snapshot("index.html", "<p>one</p>"), snapshot("style.css", "body{}")];

describe("path safety", () => {
  const unsafe = [
    "../../etc/passwd",
    "/etc/passwd",
    "app/../../out.ts",
    ".env",
    "config/.env",
    ".git/config",
    "node_modules/x/index.js",
  ];

  for (const path of unsafe) {
    it(`rejects a write to ${path}`, () => {
      const r = applyOperationsToTree(tree, [{ kind: "createFile", path, content: "x" }]);
      assert.equal(r.report.applied, 0);
      assert.equal(r.report.rejected, 1);
      assert.equal(r.writes.length, 0);
    });

    it(`rejects a delete of ${path}`, () => {
      const r = applyOperationsToTree(tree, [{ kind: "deleteFile", path }]);
      assert.equal(r.report.rejected, 1);
      assert.equal(r.deletes.length, 0);
    });
  }

  it("rejects a move that escapes the project", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "moveFile", from: "index.html", to: "../out.html" },
    ]);
    assert.equal(r.report.rejected, 1);
  });

  it("normalises a safe path rather than rejecting it", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "createFile", path: "./pages//about.html", content: "<p>about</p>" },
    ]);
    assert.equal(r.report.applied, 1);
    assert.equal(r.writes[0].path, "pages/about.html");
  });
});

describe("create and update semantics", () => {
  it("rejects createFile on a path that already exists", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "createFile", path: "index.html", content: "<p>two</p>" },
    ]);
    assert.equal(r.report.rejected, 1);
    assert.match(r.report.results[0].detail ?? "", /already exists/);
  });

  it("rejects updateFile on a path that does not exist", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "updateFile", path: "missing.html", content: "x" },
    ]);
    assert.equal(r.report.rejected, 1);
    assert.match(r.report.results[0].detail ?? "", /does not exist/);
  });

  it("skips a write whose content is unchanged", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "updateFile", path: "index.html", content: "<p>one</p>" },
    ]);
    assert.equal(r.report.applied, 0);
    assert.equal(r.report.skipped, 1);
    assert.equal(r.report.changedPaths.length, 0);
  });

  it("applies a genuine update and records the new hash", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "updateFile", path: "index.html", content: "<p>changed</p>" },
    ]);
    assert.equal(r.report.applied, 1);
    assert.equal(r.report.results[0].hashAfter, hashContent("<p>changed</p>"));
  });

  it("sees earlier operations in the same batch", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "createFile", path: "new.html", content: "a" },
      { kind: "updateFile", path: "new.html", content: "b" },
    ]);
    assert.equal(r.report.applied, 2);
    assert.equal(r.writes.find((w) => w.path === "new.html")?.content, "b");
  });
});

describe("delete and move", () => {
  it("skips deleting a file that is not there", () => {
    const r = applyOperationsToTree(tree, [{ kind: "deleteFile", path: "ghost.html" }]);
    assert.equal(r.report.skipped, 1);
  });

  it("moves a file and removes the source", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "moveFile", from: "index.html", to: "home.html" },
    ]);
    assert.equal(r.report.applied, 1);
    assert.ok(r.deletes.includes("index.html"));
    assert.equal(r.writes.find((w) => w.path === "home.html")?.content, "<p>one</p>");
  });

  it("refuses to move onto an occupied path", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "moveFile", from: "index.html", to: "style.css" },
    ]);
    assert.equal(r.report.rejected, 1);
  });
});

describe("operations with no executor", () => {
  const gated: FileOperation[] = [
    { kind: "runCommand", command: "npm install" },
    { kind: "installDependency", name: "react", version: "^19" },
    { kind: "updateConfig", path: "package.json", key: "scripts.dev", value: "next dev" },
  ];

  for (const op of gated) {
    it(`rejects ${op.kind} explicitly rather than dropping it`, () => {
      const r = applyOperationsToTree(tree, [op]);
      assert.equal(r.report.rejected, 1);
      assert.match(r.report.results[0].detail ?? "", /execution environment/);
    });
  }
});

describe("limits", () => {
  it("rejects operations past the batch cap but still applies the ones within it", () => {
    const ops: FileOperation[] = Array.from({ length: 205 }, (_, i) => ({
      kind: "createFile",
      path: `p${i}.html`,
      content: `${i}`,
    }));
    const r = applyOperationsToTree(tree, ops);
    assert.equal(r.report.applied, 200);
    assert.equal(r.report.rejected, 5);
  });

  it("rejects a file over the size ceiling", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "createFile", path: "big.html", content: "x".repeat(600 * 1024) },
    ]);
    assert.equal(r.report.rejected, 1);
    assert.match(r.report.results[0].detail ?? "", /limit is/);
  });
});

describe("one bad operation does not lose the batch", () => {
  it("applies the good ones and names the bad one", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "createFile", path: "a.html", content: "a" },
      { kind: "createFile", path: "../escape.html", content: "bad" },
      { kind: "createFile", path: "b.html", content: "b" },
    ]);
    assert.equal(r.report.applied, 2);
    assert.equal(r.report.rejected, 1);
    assert.deepEqual([...r.report.changedPaths], ["a.html", "b.html"]);
  });
});

describe("treeAfter", () => {
  it("reflects writes and deletes, sorted by path", () => {
    const r = applyOperationsToTree(tree, [
      { kind: "createFile", path: "about.html", content: "about" },
      { kind: "deleteFile", path: "style.css" },
    ]);
    const next = treeAfter(tree, r);
    assert.deepEqual(next.map((f) => f.path), ["about.html", "index.html"]);
  });
});
