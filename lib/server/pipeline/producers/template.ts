/** The deterministic template producer. SERVER ONLY.
 *
 * Wraps the fixed site template as operations, so demo generation runs the
 * same lifecycle as model generation: queued → running → validating →
 * revision. Before this, the two had entirely separate engines; the only thing
 * that should differ is how the operations are produced, and now that is the
 * only thing that does.
 *
 * Not AI, and the run it produces records `model: null` so history cannot
 * imply otherwise.
 */
import type { FileOperation } from "../../../domain";
import { buildSite, describeInputs, filePathForRoute } from "../../demo/generation";
import type { OperationProducer, ProducedChange, ProducerContext } from "../types";

export const templateProducer: OperationProducer = {
  mode: "demo",

  async produce(ctx: ProducerContext): Promise<ProducedChange> {
    ctx.report("assembling typed components · responsive rules");

    // The template takes the brief as a text input; rebuild the shape it
    // expects from the instruction the pipeline already extracted.
    const site = buildSite(
      ctx.project.name,
      ctx.instruction
        ? [
            {
              id: "brief" as never,
              kind: "text" as const,
              text: ctx.instruction,
              createdAt: new Date().toISOString(),
            },
          ]
        : []
    );

    // Whether a path is a create or an update is decided against the project
    // map the pipeline already retrieved — the validator rejects the wrong
    // one, so this has to be right rather than optimistic.
    const existing = new Set(ctx.context.map.paths);
    const write = (path: string, content: string): FileOperation =>
      existing.has(path)
        ? { kind: "updateFile", path, content }
        : { kind: "createFile", path, content };

    const operations: FileOperation[] = site.pages.map((page) =>
      write(filePathForRoute(page.path), page.source)
    );
    operations.push(
      write("design-tokens.json", `${JSON.stringify(site.tokens, null, 2)}\n`)
    );

    const isInitial = ctx.context.map.totalFiles === 0;

    return {
      operations,
      plan: {
        intent: isInitial ? "create" : "modify",
        summary: isInitial
          ? `Initial build from ${describeInputs(
              ctx.instruction ? [{ id: "b" as never, kind: "text", text: ctx.instruction, createdAt: "" }] : []
            )}`
          : `Revision from ${describeInputs(
              ctx.instruction ? [{ id: "b" as never, kind: "text", text: ctx.instruction, createdAt: "" }] : []
            )}`,
        steps: operations.map((op, i) => ({
          id: `step-${i + 1}`,
          title: `Write ${op.kind === "createFile" || op.kind === "updateFile" ? op.path : ""}`,
          action: op.kind === "createFile" ? ("create" as const) : ("update" as const),
          targets: op.kind === "createFile" || op.kind === "updateFile" ? [op.path] : [],
          rationale: null,
        })),
        isInitialBuild: isInitial,
        dependencies: [],
        configChanges: [],
        validation: [],
        notes: null,
      },
      // No model was involved. Recorded as such.
      model: null,
    };
  },
};
