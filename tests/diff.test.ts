/** Comparing two trees.
 *
 * Pure functions over frozen trees, so the tests can be exhaustive about the
 * cases that matter: a file appearing, disappearing, changing, and — the one
 * that is easy to get wrong — not changing at all.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changeMarker, changedOnly, diffLines, diffTrees, MAX_DIFF_LINES } from "../lib/domain/diff";
import { byteLength, hashContent, type FileSnapshot } from "../lib/domain/file";

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

describe("diffTrees", () => {
  it("reports a file that did not change as unchanged", () => {
    const tree = [file("index.html", "hello")];
    const diff = diffTrees(tree, [file("index.html", "hello")]);

    assert.equal(diff.identical, true);
    assert.equal(diff.unchanged, 1);
    assert.equal(diff.added + diff.modified + diff.deleted, 0);
    assert.deepEqual(changedOnly(diff), []);
  });

  it("detects added, modified and deleted files together", () => {
    const before = [file("a.html", "one"), file("b.css", "body{}")];
    const after = [file("a.html", "one\ntwo"), file("c.js", "console.log(1)")];
    const diff = diffTrees(before, after);

    assert.equal(diff.added, 1);
    assert.equal(diff.modified, 1);
    assert.equal(diff.deleted, 1);
    assert.equal(diff.identical, false);

    const byPath = new Map(diff.changes.map((c) => [c.path, c.status]));
    assert.equal(byPath.get("c.js"), "added");
    assert.equal(byPath.get("a.html"), "modified");
    assert.equal(byPath.get("b.css"), "deleted");
  });

  it("uses the hash, not the content, to decide a file changed", () => {
    // Same bytes reached by a different route: still unchanged. This is the
    // property that keeps the diff agreeing with the applier, which also
    // decides by hash.
    const before = [file("x.txt", "abc")];
    const after: FileSnapshot[] = [{ ...file("x.txt", "abc") }];
    assert.equal(diffTrees(before, after).identical, true);
  });

  it("counts line movement on a modified file", () => {
    const before = [file("p.txt", "a\nb\nc")];
    const after = [file("p.txt", "a\nB\nc\nd")];
    const change = diffTrees(before, after).changes[0];

    assert.equal(change.status, "modified");
    assert.equal(change.linesAdded, 2); // "B" and "d"
    assert.equal(change.linesRemoved, 1); // "b"
  });

  it("reports the byte delta with a sign", () => {
    const grew = diffTrees([file("f", "ab")], [file("f", "abcd")]).changes[0];
    const shrank = diffTrees([file("f", "abcd")], [file("f", "ab")]).changes[0];

    assert.equal(grew.byteDelta, 2);
    assert.equal(shrank.byteDelta, -2);
  });

  it("orders changed files added, then modified, then deleted", () => {
    const before = [file("gone.txt", "x"), file("same.txt", "s"), file("edit.txt", "1")];
    const after = [file("new.txt", "n"), file("same.txt", "s"), file("edit.txt", "2")];
    const order = changedOnly(diffTrees(before, after)).map((c) => c.path);

    assert.deepEqual(order, ["new.txt", "edit.txt", "gone.txt"]);
  });

  it("handles both trees being empty", () => {
    const diff = diffTrees([], []);
    assert.equal(diff.identical, true);
    assert.deepEqual(diff.changes, []);
  });

  it("treats a first build as every file added", () => {
    const diff = diffTrees([], [file("a", "1"), file("b", "2")]);
    assert.equal(diff.added, 2);
    assert.equal(diff.deleted, 0);
  });

  it("gives each status a distinct marker", () => {
    const markers = new Set(
      (["added", "modified", "deleted"] as const).map(changeMarker)
    );
    assert.equal(markers.size, 3);
  });
});

describe("diffLines", () => {
  it("aligns unchanged lines as context", () => {
    const { lines } = diffLines("a\nb\nc", "a\nB\nc");
    assert.deepEqual(
      lines.map((l) => l.kind),
      ["context", "removed", "added", "context"]
    );
  });

  it("numbers lines against the side they exist on", () => {
    const { lines } = diffLines("keep\ndrop", "keep");
    const dropped = lines.find((l) => l.text === "drop");

    assert.equal(dropped?.kind, "removed");
    assert.equal(dropped?.before, 2);
    assert.equal(dropped?.after, null);
  });

  it("truncates rather than growing without bound", () => {
    const before = "";
    const after = Array.from({ length: MAX_DIFF_LINES + 50 }, (_, i) => `line ${i}`).join("\n");
    const { lines, truncated } = diffLines(before, after);

    assert.equal(truncated, true);
    assert.equal(lines.length, MAX_DIFF_LINES);
  });

  it("degrades to a summary rather than running a huge LCS", () => {
    // The quadratic table is what this guard exists to avoid allocating.
    const huge = Array.from({ length: 3000 }, (_, i) => `x${i}`).join("\n");
    const other = Array.from({ length: 3000 }, (_, i) => `y${i}`).join("\n");
    const { lines, truncated } = diffLines(huge, other);

    assert.equal(truncated, true);
    assert.equal(lines.length, 2);
  });
});
