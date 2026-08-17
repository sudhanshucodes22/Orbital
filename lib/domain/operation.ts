/** Structured operations — the only way the builder is allowed to change a
 *  project.
 *
 * The rule this encodes: a generation never hands back "the new project". It
 * hands back a list of operations, each one nameable, reviewable and
 * reversible. That is what makes "what exactly did the AI change?" a question
 * with an answer, and it is the precondition for diff, undo, rollback and
 * audit — none of which can be retrofitted onto a system that swaps whole
 * trees.
 *
 * `runCommand` and `installDependency` are declared here but deliberately have
 * no executor yet. Modelling them now means the plan format does not change
 * when execution arrives; leaving them unexecuted means nothing can run
 * arbitrary commands today. See lib/services/files.ts, which rejects them.
 */
import type { Timestamp } from "./ids";

export type OperationKind =
  | "createFile"
  | "updateFile"
  | "deleteFile"
  | "moveFile"
  | "installDependency"
  | "updateConfig"
  | "runCommand";

export type FileOperation =
  | { kind: "createFile"; path: string; content: string; reason?: string }
  | { kind: "updateFile"; path: string; content: string; reason?: string }
  | { kind: "deleteFile"; path: string; reason?: string }
  | { kind: "moveFile"; from: string; to: string; reason?: string }
  | {
      kind: "installDependency";
      name: string;
      /** Semver range as written into the manifest. */
      version: string;
      dev?: boolean;
      reason?: string;
    }
  | {
      kind: "updateConfig";
      /** Which config file, e.g. "package.json", "next.config.ts". */
      path: string;
      /** Dotted key path within it, e.g. "scripts.dev". */
      key: string;
      value: string;
      reason?: string;
    }
  | { kind: "runCommand"; command: string; reason?: string };

/** Per-operation outcome. A run reports one of these for every operation it
 *  was given, including the ones it refused, so a partial application is
 *  legible rather than mysterious. */
export type OperationOutcome = "applied" | "skipped" | "rejected";

export interface OperationResult {
  operation: FileOperation;
  outcome: OperationOutcome;
  /** Why it was skipped or rejected. Null when applied. */
  detail: string | null;
  /** Content hash after the operation, for file operations that applied. */
  hashAfter: string | null;
  at: Timestamp;
}

/** What a batch did in total. */
export interface ApplyReport {
  results: readonly OperationResult[];
  applied: number;
  skipped: number;
  rejected: number;
  /** Paths touched, in the order first touched. Drives the revision summary
   *  and the "files changed" list in the UI. */
  changedPaths: readonly string[];
}

export function describeOperation(op: FileOperation): string {
  switch (op.kind) {
    case "createFile": return `create ${op.path}`;
    case "updateFile": return `update ${op.path}`;
    case "deleteFile": return `delete ${op.path}`;
    case "moveFile": return `move ${op.from} → ${op.to}`;
    case "installDependency": return `install ${op.name}@${op.version}`;
    case "updateConfig": return `set ${op.key} in ${op.path}`;
    case "runCommand": return `run ${op.command}`;
  }
}

/** Operations that only touch the file tree. Everything else needs an
 *  executor that does not exist yet, and the service refuses it. */
export const FILE_OPERATION_KINDS: readonly OperationKind[] = [
  "createFile",
  "updateFile",
  "deleteFile",
  "moveFile",
];

export function isFileOperation(op: FileOperation): boolean {
  return FILE_OPERATION_KINDS.includes(op.kind);
}
