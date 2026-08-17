/** JSON Schemas handed to the provider for structured output.
 *
 * These constrain what the model may emit. They are not the validation —
 * `parse.ts` is, and it runs on every response regardless of whether the
 * provider claims to have enforced a schema. Two reasons: a provider without
 * native structured output falls back to prompting, and "the vendor said it
 * validated" is not a property this codebase should depend on for something
 * that ends up writing files.
 *
 * Pure data. No imports, no I/O.
 */

/** Structured-output schemas must be closed and fully required — an open
 *  object is a schema that validates almost anything. */
const CLOSED = { additionalProperties: false } as const;

export const PLAN_SCHEMA: Record<string, unknown> = {
  type: "object",
  ...CLOSED,
  required: [
    "intent",
    "summary",
    "isInitialBuild",
    "steps",
    "dependencies",
    "configChanges",
    "validation",
    "notes",
  ],
  properties: {
    intent: {
      type: "string",
      enum: ["create", "extend", "modify", "restyle", "fix"],
      description: "What kind of change this is.",
    },
    summary: {
      type: "string",
      description: "One sentence describing the whole change, for the user.",
    },
    isInitialBuild: {
      type: "boolean",
      description: "True only when the project has no files yet.",
    },
    steps: {
      type: "array",
      description: "Ordered units of work. Keep to the smallest set that does the job.",
      items: {
        type: "object",
        ...CLOSED,
        required: ["id", "title", "action", "targets", "rationale"],
        properties: {
          id: { type: "string" },
          title: { type: "string", description: "Imperative and user-readable." },
          action: { type: "string", enum: ["create", "update", "delete"] },
          targets: {
            type: "array",
            items: { type: "string" },
            description: "Repo-relative POSIX paths this step will touch.",
          },
          rationale: { type: ["string", "null"] },
        },
      },
    },
    dependencies: {
      type: "array",
      description:
        "Packages the change needs. Recorded only — nothing is installed, so avoid depending on them.",
      items: {
        type: "object",
        ...CLOSED,
        required: ["name", "version", "dev", "reason"],
        properties: {
          name: { type: "string" },
          version: { type: "string" },
          dev: { type: "boolean" },
          reason: { type: ["string", "null"] },
        },
      },
    },
    configChanges: {
      type: "array",
      description: "Configuration edits the change needs. Recorded only, never applied.",
      items: {
        type: "object",
        ...CLOSED,
        required: ["path", "key", "value", "reason"],
        properties: {
          path: { type: "string" },
          key: { type: "string" },
          value: { type: "string" },
          reason: { type: ["string", "null"] },
        },
      },
    },
    validation: {
      type: "array",
      items: { type: "string" },
      description: "How a reviewer would check this change landed correctly.",
    },
    notes: { type: ["string", "null"] },
  },
};

export const OPERATIONS_SCHEMA: Record<string, unknown> = {
  type: "object",
  ...CLOSED,
  required: ["operations"],
  properties: {
    operations: {
      type: "array",
      description: "The complete set of changes. Order matters; they apply in sequence.",
      items: {
        type: "object",
        ...CLOSED,
        required: ["kind"],
        properties: {
          kind: {
            type: "string",
            enum: ["createFile", "updateFile", "deleteFile", "moveFile"],
          },
          path: {
            type: "string",
            description: "For createFile, updateFile and deleteFile.",
          },
          from: { type: "string", description: "For moveFile." },
          to: { type: "string", description: "For moveFile." },
          content: {
            type: "string",
            description:
              "For createFile and updateFile: the file's COMPLETE new contents, not a diff.",
          },
          reason: { type: ["string", "null"] },
        },
      },
    },
  },
};
