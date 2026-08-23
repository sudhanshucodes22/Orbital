/** Turning model output into domain values.
 *
 * Hand-written rather than delegated to a schema library, deliberately. This
 * is the boundary where untrusted text becomes instructions to write files, so
 * it should be readable in full by whoever reviews it, with no dependency to
 * audit and no inherited coercion behaviour. The shapes are small and fixed;
 * the cost of writing them out is one file.
 *
 * Never throws and never coerces. A wrong type is a rejection, not a value
 * quietly cast — `"3"` is not `3`, and a missing array is not an empty one.
 *
 * Pure: no I/O, no imports beyond domain types.
 */
import type {
  BuildPlan,
  FileOperation,
  PlanAction,
  PlanIntent,
  PlanStep,
  PlannedConfigChange,
  PlannedDependency,
} from "../domain";
import { PLAN_ACTIONS, PLAN_INTENTS } from "../domain";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/* ------------------------------------------------------------- json ----- */

/** Extracts the JSON object from a response.
 *
 * Providers with native structured output return bare JSON. Providers without
 * it are prompted for JSON and will sometimes wrap it in a fenced block or a
 * sentence of preamble. Tolerating that is the difference between an
 * abstraction that works across vendors and one that only works for the vendor
 * it was written against — but tolerance stops at the shape: whatever is
 * extracted still has to validate.
 */
export function extractJson(text: string): ParseResult<unknown> {
  const trimmed = text.trim();
  if (!trimmed) return fail("Model returned an empty response.");

  const candidates: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) as unknown };
    } catch {
      // Try the next candidate.
    }
  }
  return fail("Model response was not valid JSON.");
}

/* ------------------------------------------------------------ fields ---- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, field: string, max = 20000): ParseResult<string> {
  if (typeof v !== "string") return fail(`${field} must be a string.`);
  if (v.length > max) return fail(`${field} exceeds ${max} characters.`);
  return { ok: true, value: v };
}

function nullableStr(v: unknown, field: string): ParseResult<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  return str(v, field);
}

function bool(v: unknown, field: string): ParseResult<boolean> {
  if (typeof v !== "boolean") return fail(`${field} must be a boolean.`);
  return { ok: true, value: v };
}

function arr(v: unknown, field: string, max: number): ParseResult<unknown[]> {
  if (!Array.isArray(v)) return fail(`${field} must be an array.`);
  if (v.length > max) return fail(`${field} has ${v.length} entries; the limit is ${max}.`);
  return { ok: true, value: v };
}

function strArray(v: unknown, field: string, max: number): ParseResult<string[]> {
  const list = arr(v, field, max);
  if (!list.ok) return list;
  const out: string[] = [];
  for (let i = 0; i < list.value.length; i++) {
    const item = str(list.value[i], `${field}[${i}]`);
    if (!item.ok) return item;
    out.push(item.value);
  }
  return { ok: true, value: out };
}

function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  field: string
): ParseResult<T> {
  if (typeof v !== "string") return fail(`${field} must be a string.`);
  if (!(allowed as readonly string[]).includes(v)) {
    return fail(`${field} must be one of: ${allowed.join(", ")}. Got "${v}".`);
  }
  return { ok: true, value: v as T };
}

/* -------------------------------------------------------------- plan ---- */

export const MAX_PLAN_STEPS = 40;

/** Did the model answer "nothing needs to change"?
 *
 * A plan carrying a real summary and an empty `steps` array is not malformed
 * output — it is a considered answer, and the commonest way to get one is to
 * ask for something the site already has. "Add a footer with a copyright line"
 * against a page that already has exactly that reaches here every time.
 *
 * `parsePlan` still rejects it, because a `BuildPlan` with no steps is not a
 * plan and nothing downstream could execute it. This exists so the caller can
 * tell that rejection apart from genuinely broken output and say something the
 * user can act on. It deliberately requires the summary: without one there is
 * nothing to distinguish this from a model that returned an empty shell.
 */
export function plannedNoChanges(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.steps) || raw.steps.length > 0) return null;
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  return summary.length > 0 ? summary : null;
}

export function parsePlan(raw: unknown): ParseResult<BuildPlan> {
  if (!isRecord(raw)) return fail("Plan must be a JSON object.");

  const intent = oneOf<PlanIntent>(raw.intent, PLAN_INTENTS, "intent");
  if (!intent.ok) return intent;

  const summary = str(raw.summary, "summary", 600);
  if (!summary.ok) return summary;
  if (!summary.value.trim()) return fail("summary must not be empty.");

  const isInitialBuild = bool(raw.isInitialBuild, "isInitialBuild");
  if (!isInitialBuild.ok) return isInitialBuild;

  const rawSteps = arr(raw.steps, "steps", MAX_PLAN_STEPS);
  if (!rawSteps.ok) return rawSteps;
  if (rawSteps.value.length === 0) return fail("A plan must contain at least one step.");

  const steps: PlanStep[] = [];
  for (let i = 0; i < rawSteps.value.length; i++) {
    const s = rawSteps.value[i];
    if (!isRecord(s)) return fail(`steps[${i}] must be an object.`);

    const id = str(s.id, `steps[${i}].id`, 120);
    if (!id.ok) return id;
    const title = str(s.title, `steps[${i}].title`, 300);
    if (!title.ok) return title;
    const action = oneOf<PlanAction>(s.action, PLAN_ACTIONS, `steps[${i}].action`);
    if (!action.ok) return action;
    const targets = strArray(s.targets, `steps[${i}].targets`, 60);
    if (!targets.ok) return targets;
    const rationale = nullableStr(s.rationale, `steps[${i}].rationale`);
    if (!rationale.ok) return rationale;

    steps.push({
      id: id.value,
      title: title.value,
      action: action.value,
      targets: targets.value,
      rationale: rationale.value,
    });
  }

  const rawDeps = arr(raw.dependencies ?? [], "dependencies", 60);
  if (!rawDeps.ok) return rawDeps;
  const dependencies: PlannedDependency[] = [];
  for (let i = 0; i < rawDeps.value.length; i++) {
    const d = rawDeps.value[i];
    if (!isRecord(d)) return fail(`dependencies[${i}] must be an object.`);
    const name = str(d.name, `dependencies[${i}].name`, 200);
    if (!name.ok) return name;
    const version = str(d.version, `dependencies[${i}].version`, 100);
    if (!version.ok) return version;
    const dev = bool(d.dev ?? false, `dependencies[${i}].dev`);
    if (!dev.ok) return dev;
    const reason = nullableStr(d.reason, `dependencies[${i}].reason`);
    if (!reason.ok) return reason;
    dependencies.push({
      name: name.value,
      version: version.value,
      dev: dev.value,
      reason: reason.value,
    });
  }

  const rawConfig = arr(raw.configChanges ?? [], "configChanges", 60);
  if (!rawConfig.ok) return rawConfig;
  const configChanges: PlannedConfigChange[] = [];
  for (let i = 0; i < rawConfig.value.length; i++) {
    const c = rawConfig.value[i];
    if (!isRecord(c)) return fail(`configChanges[${i}] must be an object.`);
    const path = str(c.path, `configChanges[${i}].path`, 400);
    if (!path.ok) return path;
    const key = str(c.key, `configChanges[${i}].key`, 200);
    if (!key.ok) return key;
    const value = str(c.value, `configChanges[${i}].value`, 2000);
    if (!value.ok) return value;
    const reason = nullableStr(c.reason, `configChanges[${i}].reason`);
    if (!reason.ok) return reason;
    configChanges.push({
      path: path.value,
      key: key.value,
      value: value.value,
      reason: reason.value,
    });
  }

  const validation = strArray(raw.validation ?? [], "validation", 40);
  if (!validation.ok) return validation;

  const notes = nullableStr(raw.notes, "notes");
  if (!notes.ok) return notes;

  return {
    ok: true,
    value: {
      intent: intent.value,
      summary: summary.value,
      steps,
      isInitialBuild: isInitialBuild.value,
      dependencies,
      configChanges,
      validation: validation.value,
      notes: notes.value,
    },
  };
}

/* -------------------------------------------------------- operations ---- */

export const MAX_PARSED_OPERATIONS = 200;

/** Only tree operations may be parsed from model output.
 *
 * `runCommand`, `installDependency` and `updateConfig` exist in the domain and
 * are rejected by the applier, but they are not accepted here at all — a
 * proposal to run a shell command should not survive as far as the applier for
 * the applier to refuse. The plan's `dependencies` and `configChanges` fields
 * are the sanctioned way to say a change needs one.
 */
const PARSEABLE_KINDS = ["createFile", "updateFile", "deleteFile", "moveFile"] as const;
type ParseableKind = (typeof PARSEABLE_KINDS)[number];

export function parseOperations(raw: unknown): ParseResult<FileOperation[]> {
  const container = isRecord(raw) && "operations" in raw ? raw.operations : raw;

  const list = arr(container, "operations", MAX_PARSED_OPERATIONS);
  if (!list.ok) return list;

  const out: FileOperation[] = [];
  for (let i = 0; i < list.value.length; i++) {
    const o = list.value[i];
    if (!isRecord(o)) return fail(`operations[${i}] must be an object.`);

    const kind = oneOf<ParseableKind>(o.kind, PARSEABLE_KINDS, `operations[${i}].kind`);
    if (!kind.ok) return kind;

    const reason = nullableStr(o.reason, `operations[${i}].reason`);
    if (!reason.ok) return reason;
    const withReason = reason.value ? { reason: reason.value } : {};

    switch (kind.value) {
      case "createFile":
      case "updateFile": {
        const path = str(o.path, `operations[${i}].path`, 400);
        if (!path.ok) return path;
        // Length is bounded here as well as in the applier: an unbounded
        // string reaching this far has already cost the memory.
        const content = str(o.content, `operations[${i}].content`, 1_000_000);
        if (!content.ok) return content;
        out.push({ kind: kind.value, path: path.value, content: content.value, ...withReason });
        break;
      }
      case "deleteFile": {
        const path = str(o.path, `operations[${i}].path`, 400);
        if (!path.ok) return path;
        out.push({ kind: "deleteFile", path: path.value, ...withReason });
        break;
      }
      case "moveFile": {
        const from = str(o.from, `operations[${i}].from`, 400);
        if (!from.ok) return from;
        const to = str(o.to, `operations[${i}].to`, 400);
        if (!to.ok) return to;
        out.push({ kind: "moveFile", from: from.value, to: to.value, ...withReason });
        break;
      }
    }
  }

  return { ok: true, value: out };
}
