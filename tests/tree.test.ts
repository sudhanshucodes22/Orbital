/** Flat paths into a tree.
 *
 * Pure, so the cases that are awkward in a UI — a file and a folder sharing a
 * name prefix, a deeply nested path, a project with no files — are cheap to
 * pin down here rather than discovered by clicking.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allFolderPaths, buildFileTree, countFiles, languageOf } from "../lib/domain/tree";
import { asProjectId } from "../lib/domain/ids";
import type { ProjectFile } from "../lib/domain/file";

const PROJECT = asProjectId("p1");

function file(path: string, byteSize = 100): ProjectFile {
  return {
    projectId: PROJECT,
    path,
    kind: "text",
    content: "x",
    storageKey: null,
    hash: `h-${path}`,
    byteSize,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildFileTree", () => {
  it("returns nothing for a project with no files", () => {
    assert.deepEqual(buildFileTree([]), []);
  });

  it("puts a root-level file at the root", () => {
    const tree = buildFileTree([file("index.html")]);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].type, "file");
    assert.equal(tree[0].path, "index.html");
  });

  it("creates a folder once for many files under it", () => {
    const tree = buildFileTree([
      file("app/a.tsx"),
      file("app/b.tsx"),
      file("app/c.tsx"),
    ]);
    assert.equal(tree.length, 1);
    const folder = tree[0];
    assert.equal(folder.type, "folder");
    if (folder.type !== "folder") return;
    assert.equal(folder.children.length, 3);
  });

  it("nests deeply without losing anything", () => {
    const tree = buildFileTree([file("a/b/c/d/deep.txt")]);
    let node = tree[0];
    const names: string[] = [];
    while (node.type === "folder") {
      names.push(node.name);
      node = node.children[0];
    }
    assert.deepEqual(names, ["a", "b", "c", "d"]);
    assert.equal(node.name, "deep.txt");
  });

  it("counts files on every ancestor, not just the immediate parent", () => {
    const tree = buildFileTree([file("app/ui/a.tsx"), file("app/ui/b.tsx"), file("app/c.tsx")]);
    const app = tree[0];
    assert.equal(app.type, "folder");
    if (app.type !== "folder") return;
    // Three beneath app, two of them beneath app/ui.
    assert.equal(app.fileCount, 3);
    const ui = app.children.find((n) => n.name === "ui");
    assert.equal(ui?.type, "folder");
    if (ui?.type !== "folder") return;
    assert.equal(ui.fileCount, 2);
  });

  it("sorts folders before files, each alphabetically", () => {
    const tree = buildFileTree([
      file("z.txt"),
      file("a.txt"),
      file("zebra/x.txt"),
      file("alpha/y.txt"),
    ]);
    assert.deepEqual(
      tree.map((n) => `${n.type === "folder" ? "d" : "f"}:${n.name}`),
      ["d:alpha", "d:zebra", "f:a.txt", "f:z.txt"]
    );
  });

  it("does not confuse a file with a folder of a similar name", () => {
    // "app.tsx" and "app/page.tsx" share a prefix but are unrelated.
    const tree = buildFileTree([file("app.tsx"), file("app/page.tsx")]);
    const folder = tree.find((n) => n.type === "folder");
    const loose = tree.find((n) => n.type === "file");
    assert.equal(folder?.name, "app");
    assert.equal(loose?.name, "app.tsx");
  });

  it("carries the hash so a caller can tell a file changed", () => {
    const tree = buildFileTree([file("a.txt")]);
    assert.equal(tree[0].type === "file" && tree[0].hash, "h-a.txt");
  });

  it("skips a malformed path rather than throwing", () => {
    // A display function should never be the thing that brings the page down.
    const tree = buildFileTree([file(""), file("ok.txt")]);
    assert.equal(countFiles(tree), 1);
  });
});

describe("allFolderPaths", () => {
  it("lists every folder, including nested ones", () => {
    const tree = buildFileTree([file("a/b/c.txt"), file("d/e.txt")]);
    assert.deepEqual(allFolderPaths(tree).sort(), ["a", "a/b", "d"]);
  });

  it("is empty when nothing is nested", () => {
    assert.deepEqual(allFolderPaths(buildFileTree([file("a.txt")])), []);
  });
});

describe("countFiles", () => {
  it("counts files at every depth", () => {
    const tree = buildFileTree([file("a.txt"), file("x/b.txt"), file("x/y/c.txt")]);
    assert.equal(countFiles(tree), 3);
  });
});

describe("languageOf", () => {
  it("names the common ones", () => {
    assert.equal(languageOf("a/b/page.tsx"), "TypeScript");
    assert.equal(languageOf("styles.css"), "CSS");
    assert.equal(languageOf("index.html"), "HTML");
  });

  it("falls back to the extension rather than guessing", () => {
    assert.equal(languageOf("weird.xyz"), "XYZ");
  });

  it("handles a file with no extension", () => {
    // The trap: lastIndexOf(".") returns -1, and slicing from 0 would report
    // the extension as "LICENSE".
    assert.equal(languageOf("LICENSE"), "File");
    assert.equal(languageOf("app/Dockerfile"), "File");
  });

  it("treats a dotfile as a name, not an extension", () => {
    assert.equal(languageOf(".gitignore"), "File");
  });

  it("reads the extension from the file, not from a folder above it", () => {
    assert.equal(languageOf("some.folder/page.tsx"), "TypeScript");
  });
});
