/** The migrations against the adapter that queries them.
 *
 * There is no database here — no Postgres, no Supabase CLI, no credentials —
 * so the SQL cannot be executed and this makes no claim that it has been. What
 * it does check is the failure that does not need a database to detect and
 * that a database would only reveal in production: drift between the columns
 * the Supabase adapter names and the columns the migrations create.
 *
 * That drift is silent in TypeScript. `RUN_COLUMNS` is a string; adding a
 * field to `GenerationRun` and to the adapter typechecks perfectly and then
 * fails at runtime with "column does not exist". This closes that gap.
 *
 * The other half — that RLS actually isolates two users — genuinely does need
 * a live project and two accounts. It is not asserted here and is not claimed
 * anywhere else.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/* Resolved from the working directory, not from `__dirname`: the suite runs
 * from a compiled copy under .test-build, so a path relative to this file
 * points into the build output rather than at the sources being checked. */
const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase", "migrations");

/** Every migration in order, with `--` comments stripped.
 *
 * Stripping matters: statements are delimited by `;`, and these migrations are
 * heavily commented, so a prose semicolon inside a comment truncates a
 * statement mid-parse. That is not hypothetical — 0004's lease comment
 * contains one, and with comments left in, six columns parse as four and the
 * checker reports drift that does not exist. */
function sql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n")
    .replace(/--[^\n]*/g, "");
}

/** Columns a table has after every migration: those in its `create table`,
 *  plus every `add column` aimed at it. */
function columnsOf(table: string, all: string): Set<string> {
  const columns = new Set<string>();

  const create = new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`, "i");
  const body = all.match(create)?.[1] ?? "";
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    // Skip table-level constraints and the closing pieces.
    if (!trimmed || /^(primary key|constraint|unique|check|foreign key|--)/i.test(trimmed)) {
      continue;
    }
    const name = trimmed.match(/^([a-z_][a-z0-9_]*)\s/i)?.[1];
    if (name) columns.add(name);
  }

  // One `alter table` may carry several comma-separated `add column` clauses —
  // 0004 adds six that way — so each statement is taken whole and then scanned,
  // rather than matching a single clause per statement.
  const statements = new RegExp(`alter table public\\.${table}\\b([\\s\\S]*?);`, "gi");
  for (const statement of all.matchAll(statements)) {
    for (const clause of statement[1].matchAll(/add column if not exists ([a-z_][a-z0-9_]*)/gi)) {
      columns.add(clause[1]);
    }
  }

  return columns;
}

/** The select lists the adapter sends, read out of the adapter itself rather
 *  than duplicated here — a copy would drift in exactly the way this test
 *  exists to catch. */
function selectList(constant: string): string[] {
  const source = readFileSync(join(ROOT, "lib", "server", "supabase", "builder.ts"), "utf8");
  const literal = source.match(new RegExp(`const ${constant} =\\s*\\n?\\s*"([^"]+)"`))?.[1];
  assert.ok(literal, `${constant} is not a single string literal — the adapter relies on that`);
  return literal.split(",").map((c) => c.trim());
}

describe("migrations match the adapter", () => {
  it("creates every column generation_runs is queried by", () => {
    const columns = columnsOf("generation_runs", sql());
    for (const column of selectList("RUN_COLUMNS")) {
      assert.ok(columns.has(column), `generation_runs.${column} is selected but never created`);
    }
  });

  it("creates every column project_files is queried by", () => {
    const columns = columnsOf("project_files", sql());
    for (const column of selectList("FILE_COLUMNS")) {
      assert.ok(columns.has(column), `project_files.${column} is selected but never created`);
    }
  });

  it("creates every column project_revisions is queried by", () => {
    const columns = columnsOf("project_revisions", sql());
    for (const column of selectList("REVISION_COLUMNS")) {
      assert.ok(columns.has(column), `project_revisions.${column} is selected but never created`);
    }
  });

  it("allows every status the pipeline actually writes", () => {
    const all = sql();
    // The last status constraint wins — 0004 replaced 0003's, which predated
    // `running` and `validating` and would have rejected them.
    const constraints = [...all.matchAll(/generation_runs_status_check[\s\S]*?check \(status in \(([\s\S]*?)\)\)/g)];
    assert.ok(constraints.length > 0, "generation_runs has no status constraint");

    const allowed = constraints[constraints.length - 1][1]
      .split(",")
      .map((s) => s.trim().replace(/'/g, ""))
      .filter(Boolean);

    // Exactly the states the run model can be persisted in.
    for (const status of ["queued", "running", "validating", "succeeded", "failed", "cancelled"]) {
      assert.ok(allowed.includes(status), `status '${status}' is written but the check rejects it`);
    }
  });

  it("indexes the columns the history cursor pages on", () => {
    const all = sql();
    assert.match(
      all,
      /create index if not exists generation_runs_project_created_idx[\s\S]*?\(project_id, created_at desc\)/,
      "keyset pagination has no index to seek with"
    );
  });

  it("enforces one active run per project in the database, not just in code", () => {
    // The advisory findActive check races; this index is what actually holds.
    assert.match(sql(), /create unique index if not exists generation_runs_one_active_per_project/);
  });

  it("keeps every migration idempotent", () => {
    // Re-running a migration must be safe: the README tells operators so, and
    // `db push` after a partial failure is the normal recovery path.
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
      const body = readFileSync(join(MIGRATIONS, file), "utf8");
      for (const statement of body.matchAll(/^create (table|index|unique index)\s+(?!if not exists)/gim)) {
        assert.fail(`${file}: "${statement[0].trim()}" is not idempotent`);
      }
      for (const statement of body.matchAll(/^alter table [^\n]*add column\s+(?!if not exists)/gim)) {
        assert.fail(`${file}: "${statement[0].trim()}" is not idempotent`);
      }
    }
  });

  it("runs in a fixed order with no gaps", () => {
    const numbers = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => Number(f.slice(0, 4)))
      .sort((a, b) => a - b);

    assert.ok(numbers.length > 0);
    numbers.forEach((n, i) => assert.equal(n, i + 1, "migration numbering has a gap or a duplicate"));
  });
});
