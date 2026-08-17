/** Comparing two frozen trees.
 *
 * The question this answers is "what changed?", asked before someone restores
 * a revision. Until now the only thing distinguishing revision 6 from
 * revision 7 in the UI was a one-line summary written by the thing that
 * produced it, which is not evidence.
 *
 * Pure, because both trees are already frozen on their revisions — a diff is a
 * function of two values, needs no store, and can be tested exhaustively.
 *
 * Deliberately not an IDE diff. It computes a per-file status and, for text
 * files, a line-level change set good enough to answer "is this the change I
 * meant?" A real merge view is a different product decision.
 */
import type { FileSnapshot } from "./file";

export type FileChangeStatus = "added" | "modified" | "deleted" | "unchanged";

export interface FileChange {
  path: string;
  status: FileChangeStatus;
  /** Size delta in bytes. Negative when the file shrank. */
  byteDelta: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface TreeDiff {
  changes: readonly FileChange[];
  added: number;
  modified: number;
  deleted: number;
  unchanged: number;
  /** True when the two trees are byte-identical. */
  identical: boolean;
}

/** One hunk of a line-level diff, for the detail view. */
export interface DiffLine {
  kind: "context" | "added" | "removed";
  text: string;
  /** Line number in the "before" file, when it has one. */
  before: number | null;
  /** Line number in the "after" file, when it has one. */
  after: number | null;
}

const byPath = (tree: readonly FileSnapshot[]): Map<string, FileSnapshot> =>
  new Map(tree.map((f) => [f.path, f]));

/** Counts changed lines without building the whole edit script.
 *
 * A full LCS is quadratic and this runs per file on every history render. The
 * common shape here is a regenerated file, where most lines differ anyway, so
 * a multiset comparison gives the same headline numbers far more cheaply. It
 * is a count, not an alignment — `diffLines` below does the real work when
 * someone actually opens a file. */
function countLineChanges(before: string, after: string): { added: number; removed: number } {
  const tally = new Map<string, number>();
  for (const line of before.split("\n")) tally.set(line, (tally.get(line) ?? 0) + 1);

  let added = 0;
  for (const line of after.split("\n")) {
    const remaining = tally.get(line) ?? 0;
    if (remaining > 0) tally.set(line, remaining - 1);
    else added++;
  }
  let removed = 0;
  for (const remaining of tally.values()) removed += remaining;
  return { added, removed };
}

/** Compares two trees. `from` is the older revision. */
export function diffTrees(
  from: readonly FileSnapshot[],
  to: readonly FileSnapshot[]
): TreeDiff {
  const before = byPath(from);
  const after = byPath(to);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();

  const changes: FileChange[] = [];
  for (const path of paths) {
    const a = before.get(path);
    const b = after.get(path);

    if (!a && b) {
      const lines = b.content ? b.content.split("\n").length : 0;
      changes.push({ path, status: "added", byteDelta: b.byteSize, linesAdded: lines, linesRemoved: 0 });
      continue;
    }
    if (a && !b) {
      const lines = a.content ? a.content.split("\n").length : 0;
      changes.push({ path, status: "deleted", byteDelta: -a.byteSize, linesAdded: 0, linesRemoved: lines });
      continue;
    }
    if (!a || !b) continue;

    // The hash is the cheap answer and the authoritative one — it is what the
    // applier used to decide the file changed in the first place.
    if (a.hash === b.hash) {
      changes.push({ path, status: "unchanged", byteDelta: 0, linesAdded: 0, linesRemoved: 0 });
      continue;
    }

    const counts =
      a.content !== null && b.content !== null
        ? countLineChanges(a.content, b.content)
        : { added: 0, removed: 0 };
    changes.push({
      path,
      status: "modified",
      byteDelta: b.byteSize - a.byteSize,
      linesAdded: counts.added,
      linesRemoved: counts.removed,
    });
  }

  const count = (status: FileChangeStatus) => changes.filter((c) => c.status === status).length;
  const added = count("added");
  const modified = count("modified");
  const deleted = count("deleted");

  return {
    changes,
    added,
    modified,
    deleted,
    unchanged: count("unchanged"),
    identical: added === 0 && modified === 0 && deleted === 0,
  };
}

/** Only the files that actually changed, in a stable order: added, then
 *  modified, then deleted. Reads the way a change is described. */
export function changedOnly(diff: TreeDiff): readonly FileChange[] {
  const rank: Record<FileChangeStatus, number> = {
    added: 0,
    modified: 1,
    deleted: 2,
    unchanged: 3,
  };
  return diff.changes
    .filter((c) => c.status !== "unchanged")
    .sort((a, b) => rank[a.status] - rank[b.status] || a.path.localeCompare(b.path));
}

/** The marker convention the UI renders: + added, ~ modified, − deleted. */
export function changeMarker(status: FileChangeStatus): string {
  return status === "added" ? "+" : status === "deleted" ? "−" : status === "modified" ? "~" : " ";
}

export const MAX_DIFF_LINES = 400;

/** A line-level diff for one file, for the detail view.
 *
 * A real LCS this time, because it runs on one file at a time and only when
 * someone asked. Bounded: past `MAX_DIFF_LINES` the result is truncated rather
 * than allowed to grow without limit, since nobody reads a 10,000-line diff in
 * a disclosure panel.
 */
export function diffLines(before: string, after: string): {
  lines: readonly DiffLine[];
  truncated: boolean;
} {
  const a = before.split("\n");
  const b = after.split("\n");

  // Standard LCS table. Bounded by the guard below, so the quadratic cost has
  // a ceiling.
  if (a.length + b.length > 4000) {
    return {
      lines: [
        { kind: "removed", text: `${a.length} lines`, before: 1, after: null },
        { kind: "added", text: `${b.length} lines`, before: null, after: 1 },
      ],
      truncated: true,
    };
  }

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: "context", text: a[i], before: i + 1, after: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ kind: "removed", text: a[i], before: i + 1, after: null });
      i++;
    } else {
      lines.push({ kind: "added", text: b[j], before: null, after: j + 1 });
      j++;
    }
  }
  while (i < a.length) {
    lines.push({ kind: "removed", text: a[i], before: i + 1, after: null });
    i++;
  }
  while (j < b.length) {
    lines.push({ kind: "added", text: b[j], before: null, after: j + 1 });
    j++;
  }

  return {
    lines: lines.slice(0, MAX_DIFF_LINES),
    truncated: lines.length > MAX_DIFF_LINES,
  };
}
