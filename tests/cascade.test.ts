/** Deleting a project must not leave its data behind.
 *
 * The demo store has no foreign keys, so `demoProjects.delete` *is* the
 * cascade. That makes it a place where adding a table is a silent bug: the
 * Supabase side gets `on delete cascade` in the migration and keeps working,
 * the demo side keeps orphaned rows, and nothing complains. It happened —
 * `files` and `runs` were both added after that function was written and both
 * were missed, so a deleted project's file contents and prompt history stayed
 * in the store.
 *
 * This is a source-level check rather than a behavioural one on purpose. A
 * behavioural test can only assert about tables someone remembered to write a
 * case for, which is the same failure mode. Reading the store's own type
 * definition means a *newly added* table fails this test on the day it is
 * added, without anyone having to think of it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/** Collections on DemoDb that are keyed by project — i.e. whose row type has
 *  a `projectId`. Those are exactly the ones a delete has to clear. */
function projectScopedCollections(): string[] {
  const store = read("lib", "server", "demo", "store.ts");

  const rowTypesWithProjectId = new Set<string>();
  for (const match of store.matchAll(/export interface (Demo[A-Za-z]+) \{([\s\S]*?)\n\}/g)) {
    if (/^\s*projectId[?]?:/m.test(match[2])) rowTypesWithProjectId.add(match[1]);
  }

  const shape = store.match(/export interface DemoDb \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(shape, "DemoDb is not declared the way this test expects");

  const collections: string[] = [];
  for (const line of shape.split("\n")) {
    const field = line.trim().match(/^([a-z][A-Za-z]*)\s*:\s*(Demo[A-Za-z]+)\[\]/);
    if (field && rowTypesWithProjectId.has(field[2])) collections.push(field[1]);
  }
  return collections;
}

describe("deleting a project", () => {
  it("clears every collection keyed by project", () => {
    const repositories = read("lib", "server", "demo", "repositories.ts");
    const body = repositories.match(/async delete\(id: ProjectId\)[\s\S]*?\n  \},/)?.[0];
    assert.ok(body, "demoProjects.delete is not shaped the way this test expects");

    const collections = projectScopedCollections();
    assert.ok(collections.length >= 4, `only found ${collections.join(", ")}`);

    for (const name of collections) {
      assert.match(
        body,
        new RegExp(`db\\.${name}\\s*=\\s*db\\.${name}\\.filter`),
        `deleting a project leaves db.${name} behind — add it to the cascade`
      );
    }
  });

  it("cascades on the Supabase side too", () => {
    // The other half of the same invariant: in Postgres the database does it,
    // and it does it because every project-scoped table declares the cascade.
    const sql = read("supabase", "migrations", "0003_builder_core.sql");
    for (const table of ["project_files", "project_revisions", "generation_runs"]) {
      const create = sql.match(
        new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`)
      );
      assert.ok(create, `${table} is not created in 0003`);
      assert.match(
        create[1],
        /project_id[\s\S]*?references public\.projects \(id\) on delete cascade/,
        `${table}.project_id does not cascade`
      );
    }
  });
});
