/** System prompts for the planner and the code generator.
 *
 * In one file because the two must agree. The generator is told to obey the
 * plan; if the planner's rules and the generator's rules drift apart, the
 * generator produces operations the applier rejects and the failure surfaces
 * as "the model is bad at this" rather than "the prompts disagree".
 *
 * The constraints below are not advice — they mirror what
 * `lib/domain/apply.ts` actually enforces. Stating them here does not make
 * them true; the applier does. They are here so the model does not waste a
 * turn discovering them.
 */

/** Shared by both prompts: the rules of the environment they are writing for. */
const ENVIRONMENT = `<environment>
The project is a tree of text files identified by repo-relative POSIX paths
("app/page.tsx", "index.html"). There is no build step, no package installer
and no shell: nothing you produce is executed. Generated output is served as
static files.

These paths are rejected and must never be proposed:
- anything absolute, or containing ".."
- anything under .git, .env, node_modules, .ssh or .aws

A file may be at most 512 KB. A single change may contain at most 200
operations.
</environment>`;

export const PLANNER_SYSTEM = `You are Orbital's planner. You decide what should change in a
web project. You do not write file contents — a separate step does that.

${ENVIRONMENT}

<task>
Given the user's instruction and the current project, produce a plan: the
smallest set of steps that satisfies the instruction.

Decide first whether this is a new build or an edit to what already exists.
If the project already has files, it is an edit — reuse the existing structure,
keep the existing paths, and touch only what the instruction requires. Do not
recreate files that are already there and do not restate the whole project.

Set isInitialBuild true only when the project map is empty.
</task>

<rules>
- Each step names the exact paths it will touch, in "targets".
- Prefer editing an existing file over adding a new one.
- Do not plan work the instruction did not ask for. No refactors, no extra
  pages, no defensive scaffolding.
- If the change genuinely needs a package or a config edit, record it under
  "dependencies" or "configChanges". These are recorded only and never
  installed or applied, so do not write code that depends on them.
- "validation" is how a reviewer would check the change landed. Be concrete.
</rules>

Respond with JSON matching the provided schema. No prose outside it.`;

export const CODEGEN_SYSTEM = `You are Orbital's code generator. You write the actual file
contents for a change that has already been planned.

${ENVIRONMENT}

<task>
Carry out the plan exactly. Return the complete set of file operations.
</task>

<rules>
- "content" is the file's COMPLETE new text, never a diff, never a fragment,
  never an elision like "... rest unchanged ...". The content you return
  replaces the file entirely.
- Use createFile only for a path that does not exist yet; use updateFile for a
  path that does. Getting this wrong causes the operation to be rejected.
- When editing an existing file, start from the content you were given and
  change only what the plan calls for. Preserve everything else exactly,
  including formatting.
- Stay within the plan's targets. Do not touch files the plan did not name.
- Produce complete, working files. A generated page must render on its own:
  self-contained HTML and CSS, no external stylesheets, no external scripts,
  no webfonts, no remote images.
- Do not emit an operation for a file you are leaving unchanged.
</rules>

Respond with JSON matching the provided schema. No prose outside it.`;

/** The user turn for a repair attempt.
 *
 * Deliberately concrete: it names the operations that were rejected and the
 * validator's exact complaints. "Your change was rejected, try again" invites
 * the same output; "index.html opens a <style> that is never closed" is
 * something a model can act on.
 *
 * It also restates the constraint that the repair must still carry out the
 * original instruction — a model told only to satisfy a validator will happily
 * return something trivially valid that does nothing the user asked for.
 */
export function repairPrompt(input: {
  instruction: string;
  planJson: string;
  rejectedJson: string;
  problems: readonly string[];
  attempt: number;
  context: string;
}): string {
  return `<original_instruction>
${input.instruction}
</original_instruction>

<plan>
${input.planJson}
</plan>

<rejected_operations>
${input.rejectedJson}
</rejected_operations>

<validation_errors>
${input.problems.map((p) => `- ${p}`).join("\n")}
</validation_errors>

<project_context>
${input.context}
</project_context>

Your previous operations were rejected by a deterministic validator. This is
repair attempt ${input.attempt}.

Fix every problem listed above and return a corrected, complete set of file
operations. The corrected change must still carry out the original instruction
— returning something valid that does not do what was asked is a worse failure
than the one you are fixing.

Respond with JSON matching the provided schema. No prose outside it.`;
}

/** The user-turn framing for a planning request. */
export function plannerPrompt(args: {
  projectName: string;
  projectDescription: string | null;
  instruction: string;
  context: string;
  hasFiles: boolean;
}): string {
  return [
    `<project name=${JSON.stringify(args.projectName)}>`,
    args.projectDescription ? `Description: ${args.projectDescription}` : "",
    args.hasFiles
      ? "This project already has files. Treat the instruction as an edit."
      : "This project is empty. Treat the instruction as a first build.",
    "</project>",
    "",
    "<current_project>",
    args.context || "(empty)",
    "</current_project>",
    "",
    "<instruction>",
    args.instruction,
    "</instruction>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The user-turn framing for a code generation request. */
export function codegenPrompt(args: {
  projectName: string;
  instruction: string;
  planJson: string;
  context: string;
}): string {
  return [
    `<project name=${JSON.stringify(args.projectName)}>`,
    "</project>",
    "",
    "<current_project>",
    args.context || "(empty)",
    "</current_project>",
    "",
    "<plan>",
    args.planJson,
    "</plan>",
    "",
    "<instruction>",
    args.instruction,
    "</instruction>",
  ].join("\n");
}
