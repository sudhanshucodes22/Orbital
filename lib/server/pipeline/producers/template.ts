/** The template producer. SERVER ONLY.
 *
 * Wraps the fixed site template as operations, so demo generation runs the
 * same pipeline as the model path. Everything that differs between the two is
 * how operations are produced; run state, validation, application, revisions
 * and failure recording are shared.
 *
 * Not AI, and the run it produces records `model: null` so history cannot
 * imply otherwise.
 *
 * ## Two modes, deliberately
 *
 * **An empty project is built.** The template renders a whole site from the
 * brief, which is what "make me a site about X" means.
 *
 * **A project with files is edited.** `planTargetedEdit` works out which files
 * the instruction is about and rewrites only those. This is the difference
 * between an iterative editor and a one-shot generator: rebuilding every file
 * on every turn meant asking for a navbar also replaced the hero text, because
 * the hero text was derived from whatever the last instruction said.
 *
 * The model path reaches the same behaviour by being *told* to
 * ("Prefer editing an existing file over adding a new one"). This makes demo
 * mode do it deterministically, so the loop is real and testable without an
 * API key.
 */
import type { FileOperation, ProjectFile } from "../../../domain";
import { buildSite, describeInputs, filePathForRoute } from "../../demo/generation";
import { planTargetedEdit } from "../../demo/edits";
import { getContainer } from "../../container";
import type { OperationProducer, ProducedChange, ProducerContext } from "../types";

/** The instruction as the shape `describeInputs` expects. */
const asInputs = (instruction: string) =>
  instruction
    ? [{ id: "brief" as never, kind: "text" as const, text: instruction, createdAt: "" }]
    : [];

export const templateProducer: OperationProducer = {
  mode: "demo",

  async produce(ctx: ProducerContext): Promise<ProducedChange> {
    const isInitial = ctx.context.map.totalFiles === 0;

    return isInitial ? buildInitial(ctx) : editExisting(ctx);
  },
};

/** A whole site, from nothing. */
function buildInitial(ctx: ProducerContext): ProducedChange {
  ctx.report("assembling typed components · responsive rules");

  const site = buildSite(ctx.project.name, asInputs(ctx.instruction));

  const operations: FileOperation[] = site.pages.map((page) => ({
    kind: "createFile",
    path: filePathForRoute(page.path),
    content: page.source,
  }));
  operations.push({
    kind: "createFile",
    path: "design-tokens.json",
    content: `${JSON.stringify(site.tokens, null, 2)}\n`,
  });

  return {
    operations,
    plan: {
      intent: "create",
      summary: `Initial build from ${describeInputs(asInputs(ctx.instruction))}`,
      steps: operations.map((op, i) => ({
        id: `step-${i + 1}`,
        title: `Write ${"path" in op ? op.path : ""}`,
        action: "create" as const,
        targets: "path" in op ? [op.path] : [],
        rationale: null,
      })),
      isInitialBuild: true,
      dependencies: [],
      configChanges: [],
      validation: [],
      notes: null,
    },
    model: null,
  };
}

/** A targeted change to a project that already exists. */
async function editExisting(ctx: ProducerContext): Promise<ProducedChange> {
  ctx.report("reading the current project");

  // Read through the repository rather than from `ctx.context.slices`. The
  // context window is *budgeted and truncatable* — correct for a model, which
  // must not see everything, and wrong for a patcher, which needs exact bytes.
  // Writing back a truncated slice would silently delete the rest of the file.
  const files: ProjectFile[] = await getContainer().files.list(ctx.project.id);

  const { updates, rule } = planTargetedEdit(files, ctx.instruction);

  ctx.report(
    updates.size === 0
      ? "no matching change found"
      : `editing ${updates.size} file(s) · ${rule?.id ?? "content"}`
  );

  // Only files that genuinely changed. An operation for a byte-identical file
  // would be reported to the user as an edit and then show an empty diff —
  // and the pipeline's validator refuses no-op batches anyway.
  const operations: FileOperation[] = [...updates].map(([path, content]) => ({
    kind: "updateFile",
    path,
    content,
  }));

  const summary =
    updates.size === 0
      ? `No change matched "${ctx.instruction}"`
      : `${rule?.describe(ctx.instruction) ?? "Apply the requested change"} · ${
          updates.size
        } file(s)`;

  return {
    operations,
    plan: {
      // "modify" rather than "create": this is an edit to something that
      // exists, and the intent is what the UI shows.
      intent: "modify",
      summary,
      steps: [...updates.keys()].map((path, i) => ({
        id: `step-${i + 1}`,
        title: `Update ${path}`,
        action: "update" as const,
        targets: [path],
        rationale: rule ? rule.describe(ctx.instruction) : null,
      })),
      isInitialBuild: false,
      dependencies: [],
      configChanges: [],
      validation: [],
      notes:
        updates.size === 0
          ? "The template engine matches instructions by keyword. Try naming a part of the page — the hero, the navbar, the CTA, the palette, spacing, or responsiveness."
          : null,
    },
    model: null,
  };
}
