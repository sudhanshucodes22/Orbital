/** Validation of generated operations, before anything is written.
 *
 * The gate: a revision is only cut if this passes. The applier in `apply.ts`
 * enforces the same path and size rules as it works, but that is defence in
 * depth, not the gate — by the time the applier refuses something, a partial
 * change has already been decided on. This runs first, on the whole batch, and
 * answers one question: is this output safe and coherent enough to become a
 * revision at all?
 *
 * Deterministic on purpose. Every check here is a rule that can be read,
 * reproduced and argued with. An AI-assisted reviewer is a reasonable thing to
 * add later — `validateOperations` is the seam for it, and its result type
 * already carries warnings, which is where a probabilistic judgement belongs.
 * It must never replace these checks, because "the model thought it looked
 * fine" is not a security boundary.
 *
 * Pure: no I/O, no imports beyond domain types.
 */
import type { FileSnapshot } from "./file";
import { MAX_TEXT_FILE_BYTES, byteLength, looksTextual, normalizeFilePath } from "./file";
import { MAX_OPERATIONS_PER_BATCH } from "./apply";
import type { FileOperation } from "./operation";
import { describeOperation, isFileOperation } from "./operation";

export type ValidationCode =
  | "unsafePath"
  | "unsupportedOperation"
  | "fileTooLarge"
  | "batchTooLarge"
  | "malformedOperation"
  | "conflictingOperations"
  | "duplicateOperation"
  | "missingTarget"
  | "targetExists"
  | "emptyBatch"
  | "noEffect"
  | "binaryContent";

export interface ValidationIssue {
  code: ValidationCode;
  message: string;
  /** Index into the operation list, when the issue belongs to one operation. */
  operationIndex: number | null;
  path: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: readonly ValidationIssue[];
  warnings: readonly ValidationIssue[];
  checkedOperations: number;
}

const issue = (
  code: ValidationCode,
  message: string,
  operationIndex: number | null = null,
  path: string | null = null
): ValidationIssue => ({ code, message, operationIndex, path });

/** Paths a generated project should not be writing even though they are
 *  structurally legal. Warned about rather than refused: they are suspicious,
 *  not unsafe, and refusing them would block legitimate edits to a project
 *  that genuinely contains one. */
const SENSITIVE_HINTS = [/(^|\/)\.env/i, /secret/i, /credential/i, /\.pem$/i, /\.key$/i];

/** Every path an operation touches, normalised, or null when it is unsafe. */
function targetsOf(op: FileOperation): { paths: string[]; unsafe: string | null } {
  const collect: string[] = [];
  const raw: string[] =
    op.kind === "moveFile"
      ? [op.from, op.to]
      : op.kind === "createFile" || op.kind === "updateFile" || op.kind === "deleteFile"
        ? [op.path]
        : [];

  for (const value of raw) {
    const verdict = normalizeFilePath(value);
    if (!verdict.ok) return { paths: [], unsafe: `${value}: ${verdict.reason}` };
    collect.push(verdict.path);
  }
  return { paths: collect, unsafe: null };
}

/**
 * Checks a batch against the tree it would apply to.
 *
 * `existing` is the current working tree. It is needed because half of what
 * makes a batch invalid is relational: creating a file that is already there,
 * updating one that is not, moving onto an occupied path, or two operations
 * fighting over the same path.
 */
export function validateOperations(
  existing: readonly FileSnapshot[],
  operations: readonly FileOperation[]
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (operations.length === 0) {
    return {
      valid: false,
      errors: [issue("emptyBatch", "The generation produced no operations.")],
      warnings: [],
      checkedOperations: 0,
    };
  }

  if (operations.length > MAX_OPERATIONS_PER_BATCH) {
    errors.push(
      issue(
        "batchTooLarge",
        `${operations.length} operations exceeds the limit of ${MAX_OPERATIONS_PER_BATCH}.`
      )
    );
  }

  // Simulated tree state, so relational checks see the batch in order rather
  // than judging every operation against the original tree.
  const present = new Set(existing.map((f) => f.path));
  /** path → index of the operation that last touched it, for conflict reporting. */
  const lastTouchedBy = new Map<string, number>();
  let effective = 0;

  operations.forEach((op, index) => {
    if (!isFileOperation(op)) {
      errors.push(
        issue(
          "unsupportedOperation",
          `${describeOperation(op)} requires an execution environment, which does not exist.`,
          index
        )
      );
      return;
    }

    const { paths, unsafe } = targetsOf(op);
    if (unsafe) {
      errors.push(issue("unsafePath", `Rejected path — ${unsafe}`, index));
      return;
    }

    for (const path of paths) {
      const previous = lastTouchedBy.get(path);
      if (previous !== undefined) {
        // Two operations on one path is usually a model emitting the same file
        // twice. It is an error rather than a warning because the second write
        // silently wins, and "silently wins" is how a change nobody reviewed
        // ends up in a revision.
        errors.push(
          issue(
            "conflictingOperations",
            `Operations ${previous} and ${index} both touch ${path}.`,
            index,
            path
          )
        );
      }
      lastTouchedBy.set(path, index);

      if (SENSITIVE_HINTS.some((re) => re.test(path))) {
        warnings.push(
          issue("noEffect", `${path} looks sensitive; check this change deliberately.`, index, path)
        );
      }
    }

    switch (op.kind) {
      case "createFile":
      case "updateFile": {
        const path = paths[0];
        if (typeof op.content !== "string") {
          errors.push(issue("malformedOperation", `${op.kind} has no content.`, index, path));
          break;
        }
        const size = byteLength(op.content);
        if (size > MAX_TEXT_FILE_BYTES) {
          errors.push(
            issue(
              "fileTooLarge",
              `${path} is ${size} bytes; the limit is ${MAX_TEXT_FILE_BYTES}.`,
              index,
              path
            )
          );
        }
        // A NUL byte in something being written as text means the model
        // produced binary, which the text-file path cannot represent.
        if (op.content.includes("\0")) {
          errors.push(
            issue("binaryContent", `${path} contains a null byte; expected text.`, index, path)
          );
        }
        if (!looksTextual(path)) {
          warnings.push(
            issue("noEffect", `${path} has no recognised text extension.`, index, path)
          );
        }
        if (op.kind === "createFile" && present.has(path)) {
          errors.push(
            issue("targetExists", `${path} already exists; use updateFile.`, index, path)
          );
        }
        if (op.kind === "updateFile" && !present.has(path)) {
          errors.push(
            issue("missingTarget", `${path} does not exist; use createFile.`, index, path)
          );
        }
        present.add(path);
        effective++;
        break;
      }

      case "deleteFile": {
        const path = paths[0];
        if (!present.has(path)) {
          // Not an error: deleting something already gone is a no-op, and
          // failing a whole batch over it would be brittle.
          warnings.push(issue("noEffect", `${path} does not exist; delete is a no-op.`, index, path));
          break;
        }
        present.delete(path);
        effective++;
        break;
      }

      case "moveFile": {
        const [from, to] = paths;
        if (from === to) {
          errors.push(issue("malformedOperation", `Move source and destination are the same.`, index, from));
          break;
        }
        if (!present.has(from)) {
          errors.push(issue("missingTarget", `${from} does not exist.`, index, from));
          break;
        }
        if (present.has(to)) {
          errors.push(issue("targetExists", `${to} already exists.`, index, to));
          break;
        }
        present.delete(from);
        present.add(to);
        effective++;
        break;
      }
    }
  });

  // A batch that validates but changes nothing would cut a revision claiming a
  // change that did not happen.
  if (errors.length === 0 && effective === 0) {
    errors.push(issue("noEffect", "No operation in this batch would change the project."));
  }

  // Consistency: a web project that ends with no entry point is not a project.
  if (errors.length === 0 && present.size > 0) {
    const hasEntry = [...present].some((p) => /^(index\.html|app\/page\.[jt]sx?|src\/index\.[jt]sx?)$/.test(p));
    if (!hasEntry) {
      warnings.push(issue("noEffect", "The project has no recognisable entry point."));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checkedOperations: operations.length,
  };
}

/** One line, for an event stream or a run's error field. */
export function summariseValidation(result: ValidationResult): string {
  if (result.valid) {
    return `${result.checkedOperations} operation(s) validated${
      result.warnings.length ? `, ${result.warnings.length} warning(s)` : ""
    }`;
  }
  const first = result.errors[0];
  const rest = result.errors.length - 1;
  return `${first.message}${rest > 0 ? ` (and ${rest} more problem${rest === 1 ? "" : "s"})` : ""}`;
}
