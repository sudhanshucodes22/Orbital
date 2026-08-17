/** Applying operations to a working tree — the pure core.
 *
 * Pure on purpose. Two callers need this logic: `lib/services/files.ts`, which
 * authorises a user and persists the result, and the generation engine, which
 * runs after authorisation has already happened and has no session to check.
 * Duplicating it would mean two implementations of the security rules, which
 * is how they end up disagreeing.
 *
 * It is also the reason this can be tested without a store, a container or a
 * session: given a tree and a list of operations, the outcome is a value.
 *
 * This is a trust boundary. Operations arriving here were proposed by a model,
 * which makes them input, not instructions. Every path and size is
 * re-validated regardless of origin, and nothing throws on a bad operation —
 * it is recorded as a rejection and the batch continues, so eleven good edits
 * are not lost to one bad twelfth and the attempt stays visible in history.
 */
import type { FileSnapshot } from "./file";
import { MAX_TEXT_FILE_BYTES, byteLength, hashContent, normalizeFilePath } from "./file";
import type { ApplyReport, FileOperation, OperationResult } from "./operation";
import { describeOperation } from "./operation";

/** Ceiling on a single batch. A runaway model proposing thousands of writes is
 *  a denial-of-service against the store, not a large refactor. */
export const MAX_OPERATIONS_PER_BATCH = 200;

export interface ApplyPlanResult {
  report: ApplyReport;
  /** Snapshots to persist, in the order first touched. */
  writes: readonly FileSnapshot[];
  /** Paths to remove. */
  deletes: readonly string[];
}

/** Works out what a batch would do, without doing any of it.
 *
 * `existing` is the tree as persisted. The working set is updated as
 * operations apply, so a create followed by an update in the same batch sees
 * the create — applying every operation against the original tree would make
 * batch order meaningless.
 */
export function applyOperationsToTree(
  existing: readonly FileSnapshot[],
  operations: readonly FileOperation[],
  now: string = new Date().toISOString()
): ApplyPlanResult {
  const results: OperationResult[] = [];
  const changedPaths: string[] = [];
  const working = new Map<string, FileSnapshot>(existing.map((f) => [f.path, f]));
  const deletes = new Set<string>();

  const record = (
    operation: FileOperation,
    outcome: OperationResult["outcome"],
    detail: string | null,
    hashAfter: string | null = null
  ) => {
    results.push({ operation, outcome, detail, hashAfter, at: now });
  };

  const touch = (path: string) => {
    if (!changedPaths.includes(path)) changedPaths.push(path);
  };

  const capped = operations.slice(0, MAX_OPERATIONS_PER_BATCH);
  for (const op of operations.slice(MAX_OPERATIONS_PER_BATCH)) {
    record(op, "rejected", `Batch limit of ${MAX_OPERATIONS_PER_BATCH} operations exceeded.`);
  }

  for (const op of capped) {
    switch (op.kind) {
      case "createFile":
      case "updateFile": {
        const verdict = normalizeFilePath(op.path);
        if (!verdict.ok) { record(op, "rejected", verdict.reason); break; }
        const size = byteLength(op.content);
        if (size > MAX_TEXT_FILE_BYTES) {
          record(op, "rejected", `File is ${size} bytes; the limit is ${MAX_TEXT_FILE_BYTES}.`);
          break;
        }
        const hash = hashContent(op.content);
        const prior = working.get(verdict.path);
        if (prior && prior.hash === hash) {
          // A model re-emitting an unchanged file is common and harmless, but
          // it must not produce a revision that claims a change.
          record(op, "skipped", "Content is unchanged.", hash);
          break;
        }
        if (op.kind === "createFile" && prior) {
          record(op, "rejected", "File already exists; use updateFile.");
          break;
        }
        if (op.kind === "updateFile" && !prior) {
          record(op, "rejected", "File does not exist; use createFile.");
          break;
        }
        working.set(verdict.path, {
          path: verdict.path,
          kind: "text",
          content: op.content,
          storageKey: null,
          hash,
          byteSize: size,
        });
        deletes.delete(verdict.path);
        touch(verdict.path);
        record(op, "applied", null, hash);
        break;
      }

      case "deleteFile": {
        const verdict = normalizeFilePath(op.path);
        if (!verdict.ok) { record(op, "rejected", verdict.reason); break; }
        if (!working.has(verdict.path)) {
          record(op, "skipped", "File does not exist.");
          break;
        }
        working.delete(verdict.path);
        deletes.add(verdict.path);
        touch(verdict.path);
        record(op, "applied", null);
        break;
      }

      case "moveFile": {
        const from = normalizeFilePath(op.from);
        const to = normalizeFilePath(op.to);
        if (!from.ok) { record(op, "rejected", `Source: ${from.reason}`); break; }
        if (!to.ok) { record(op, "rejected", `Destination: ${to.reason}`); break; }
        const source = working.get(from.path);
        if (!source) { record(op, "rejected", "Source file does not exist."); break; }
        if (working.has(to.path)) { record(op, "rejected", "Destination already exists."); break; }
        working.delete(from.path);
        deletes.add(from.path);
        working.set(to.path, { ...source, path: to.path });
        deletes.delete(to.path);
        touch(from.path);
        touch(to.path);
        record(op, "applied", null, source.hash);
        break;
      }

      // Everything below changes the environment rather than the tree, and the
      // environment has no executor. Refused explicitly rather than silently
      // dropped, so a plan that depends on one fails loudly and the gap is
      // visible in the run history.
      case "installDependency":
      case "updateConfig":
      case "runCommand":
        record(
          op,
          "rejected",
          `${describeOperation(op)} needs an execution environment, which is not available yet.`
        );
        break;
    }
  }

  const writes = changedPaths
    .map((p) => working.get(p))
    .filter((s): s is FileSnapshot => Boolean(s));

  return {
    report: {
      results,
      applied: results.filter((r) => r.outcome === "applied").length,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      rejected: results.filter((r) => r.outcome === "rejected").length,
      changedPaths,
    },
    writes,
    deletes: [...deletes],
  };
}

/** The tree after a batch. Used to freeze a revision without re-reading the
 *  store, and to restore one. */
export function treeAfter(
  existing: readonly FileSnapshot[],
  result: ApplyPlanResult
): FileSnapshot[] {
  const next = new Map<string, FileSnapshot>(existing.map((f) => [f.path, f]));
  for (const path of result.deletes) next.delete(path);
  for (const snapshot of result.writes) next.set(snapshot.path, snapshot);
  return [...next.values()].sort((a, b) => a.path.localeCompare(b.path));
}
