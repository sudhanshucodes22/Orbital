/** Every field of a patch type reaches the database.
 *
 * ## The bug this exists for, three times over
 *
 * A repository's `update` maps a patch object onto database columns with a
 * whitelist of `if (patch.x !== undefined)` lines. Adding a field to the domain
 * type and forgetting a line here typechecks perfectly, passes every unit test
 * against the in-memory fakes, and then silently drops the value in production.
 *
 * It has happened three times:
 *
 *   1. `GenerationRun.validation` — dropped by both the demo and Supabase run
 *      adapters, so warnings on a successful change were computed and
 *      discarded. Caught by a browser check that printed "validation recorded:
 *      none".
 *   2. The same field in the Supabase adapter, separately.
 *   3. `UpdateProjectInput.status` and `.currentRevisionId` — dropped by the
 *      Supabase project adapter. Because the pipeline patches *only* those two,
 *      the resulting PATCH body was empty, matched zero rows, and `.single()`
 *      raised "Cannot coerce the result to a single JSON object". The first
 *      real Supabase generation failed in 613ms without ever reaching the
 *      model.
 *
 * Each was found by a human running the product. That is too late and too
 * expensive, and a field-by-field test written after each one would not have
 * caught the next.
 *
 * So this reads the *type* and the *adapter source* and checks they agree. A
 * field added to the domain type without a corresponding line in the adapter
 * fails here immediately, whichever field it is.
 *
 * It is a source-text check, which is unusual and worth defending: the
 * alternative is a live database, and the whole point is to catch the omission
 * before anything reaches one. It cannot verify the mapping is *correct* —
 * only that every field is mapped at all. That is precisely the failure mode
 * these three bugs shared.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/** Field names declared on an interface in a `.ts` source file.
 *
 * Comments are stripped first: these types are heavily documented, and a
 * commented-out or merely *mentioned* field name would otherwise be read as a
 * declaration. */
function fieldsOf(source: string, interfaceName: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  const match = new RegExp(`interface ${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(
    withoutComments
  );
  assert.ok(match, `${interfaceName} not found`);

  const fields: string[] = [];
  for (const line of match[1].split("\n")) {
    const name = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/.exec(line)?.[1];
    if (name) fields.push(name);
  }
  assert.ok(fields.length > 0, `${interfaceName} appears to have no fields`);
  return fields;
}

/** The body of a named method in an adapter, so the assertion is scoped to the
 *  function that does the mapping rather than the whole file. */
function methodBody(source: string, name: string): string {
  const start = source.indexOf(`async ${name}(`);
  assert.ok(start !== -1, `method ${name} not found`);
  // Far enough to cover the longest of these methods; they are all short.
  return source.slice(start, start + 2600);
}

describe("adapters map every field of the patch types they accept", () => {
  it("the Supabase project adapter maps all of UpdateProjectInput", () => {
    // The exact regression: status and currentRevisionId were missing, the
    // patch body came out empty, and the first live generation died on
    // .single() before reaching the model.
    const fields = fieldsOf(read("lib", "domain", "project.ts"), "UpdateProjectInput");
    const body = methodBody(read("lib", "server", "supabase", "repositories.ts"), "update");

    for (const field of fields) {
      assert.ok(
        body.includes(`patch.${field}`),
        `UpdateProjectInput.${field} is never read by the Supabase project adapter — ` +
          `a patch containing only that field would send an empty body and match zero rows`
      );
    }

    // And the two that caused the outage, named explicitly so the intent
    // survives even if the type is refactored.
    assert.ok(body.includes("patch.status"), "status must be mapped");
    assert.ok(body.includes("patch.currentRevisionId"), "currentRevisionId must be mapped");
  });

  it("the demo project adapter maps all of UpdateProjectInput", () => {
    // The demo adapter mapped all four, which is why the pipeline worked
    // against the file store and broke only on Supabase. Both must stay
    // complete or the two backends behave differently — and the difference
    // only appears in production.
    const fields = fieldsOf(read("lib", "domain", "project.ts"), "UpdateProjectInput");
    const body = methodBody(read("lib", "server", "demo", "repositories.ts"), "update");

    for (const field of fields) {
      assert.ok(body.includes(`patch.${field}`), `UpdateProjectInput.${field} is dropped by the demo adapter`);
    }
  });

  it("both run adapters persist the fields the pipeline patches", () => {
    // The earlier instance of this bug: `validation` was computed on every run
    // and then dropped by both adapters, so warnings on an applied change were
    // invisible. Checked here rather than field-by-field on GenerationRun,
    // because a run is patched with a subset and listing all of it would
    // assert things no adapter needs to write.
    const patched = ["status", "plan", "operations", "report", "validation", "model", "error", "failure"];

    for (const [label, path] of [
      ["demo", ["lib", "server", "demo", "files.ts"]],
      ["supabase", ["lib", "server", "supabase", "builder.ts"]],
    ] as const) {
      const body = methodBody(read(...path), "update");
      for (const field of patched) {
        assert.ok(
          body.includes(`patch.${field}`),
          `the ${label} run adapter drops patch.${field}`
        );
      }
    }
  });
});
