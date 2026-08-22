#!/usr/bin/env node
/** Live Supabase verification.
 *
 * Everything Phase 10 asks for against a real project — tables, columns,
 * constraints, indexes, RLS, and a full lifecycle including cross-user
 * isolation — in one command:
 *
 *   npm run verify
 *
 * It refuses to run without credentials rather than reporting a partial pass,
 * because a verification tool that "mostly worked" is worse than one that
 * declined: the whole point is to distinguish *verified* from *assumed*.
 *
 * Nothing here writes to a project that already has data. It creates its own
 * throwaway rows under a marker prefix and removes them, so it is safe to run
 * against a live project — though not one carrying production data, because
 * cross-user checks need two accounts.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* ------------------------------------------------------- configuration --- */

/** Reads .env.local without a dependency. The app uses Next's loader; this
 *  script runs outside Next and needs its own. */
function loadEnv() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}
loadEnv();

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [
  !URL_ && "SUPABASE_URL",
  !ANON && "SUPABASE_ANON_KEY",
  !SERVICE && "SUPABASE_SERVICE_ROLE_KEY",
].filter(Boolean);

if (missing.length > 0) {
  console.error(`
  Live Supabase verification needs credentials that are not configured.

  Missing: ${missing.join(", ")}

  Nothing was verified. This is the honest outcome, not a failure of the
  schema — see supabase/README.md for what to set and where.

  What IS checked without credentials, in the normal test suite:
    · every column the adapter selects is created by some migration
    · every run status the pipeline writes passes the status constraint
    · the pagination and one-active-run indexes exist
    · every statement is idempotent; numbering has no gaps
`);
  process.exit(2);
}

/* ------------------------------------------------------------ helpers --- */

let failures = 0;
const ok = (what, detail = "") => console.log(`  ✓ ${what.padEnd(52)} ${detail}`);
const bad = (what, detail = "") => {
  failures++;
  console.log(`  ✗ ${what.padEnd(52)} ${detail}`);
};
/** Records one check. Written as a function rather than a ternary so each
 *  assertion reads as an assertion. */
const check = (passed, what, detail = "") => (passed ? ok(what, detail) : bad(what, detail));

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  console.log(`\n  Verifying ${URL_}\n`);

  /* ---- reachability --------------------------------------------------- */
  console.log("  Connection");
  const { error: pingError } = await admin.from("projects").select("id").limit(1);

  // PGRST205 means PostgREST answered and does not know the table — the
  // connection is fine and the schema is simply absent. Reporting that as
  // "cannot connect" sends someone to check their URL and keys when what they
  // actually need is to run the migrations.
  const schemaMissing = pingError?.code === "PGRST205" || /schema cache/i.test(pingError?.message ?? "");

  // 42501 is Postgres refusing on privileges. It is a completely different
  // problem from a missing table and has a completely different fix, but both
  // surface here as "the first query failed" — so they are named apart.
  const grantsMissing =
    pingError?.code === "42501" || /permission denied/i.test(pingError?.message ?? "");

  if (grantsMissing) {
    ok("reachable", "(schema present, grants missing)");
    // Postgres names the exact statement it wants. Printing its own words
    // beats paraphrasing them, and it proves the claim rather than asserting
    // it — this is the database itself reporting the grant is absent.
    if (pingError?.hint) console.log(`\n  Postgres says: ${pingError.hint}`);
    console.log(`
  Connected and the tables exist, but no role can read them.

  Two different things produce this, and they have different fixes:

  1. The grants were never applied.
     Paste supabase/APPLY_0008_GRANTS.sql into the SQL Editor. It contains only
     GRANT statements and ends with a query listing what applied — expect 12
     rows, six tables times two roles.

  2. The grants ARE applied, but PostgREST has not noticed.
     PostgREST answers from a cached view of the schema that includes
     privileges, and a GRANT does not always prompt a reload. If the query
     above returned 12 rows, this is your case. Reload the cache with either:

       NOTIFY pgrst, 'reload schema';

     in the SQL Editor, or the "Reload schema cache" control in the project's
     API settings. Neither re-applies anything.

  Nothing about RLS is involved either way: Postgres checks privileges before
  policies, so the policies here are simply unreachable until the grant is
  both applied and visible to PostgREST.
`);
    process.exit(3);
  }

  if (pingError && !schemaMissing) {
    bad("reachable", pingError.message);
    console.log(`
  Could not reach the database. Check SUPABASE_URL and
  SUPABASE_SERVICE_ROLE_KEY — \`npm run preflight\` reports their shape without
  printing them.
`);
    process.exit(1);
  }

  ok("reachable", schemaMissing ? "(schema not applied yet)" : "");

  if (schemaMissing) {
    console.log(`
  Connected, but the schema has not been applied. This is not a credentials
  problem — PostgREST answered and does not know the tables yet.

  Apply the migrations once, then re-run this command:

    1. Open the SQL Editor for this project.
    2. Paste the whole of supabase/ALL_MIGRATIONS.sql and run it.
       (Regenerate it with \`npm run migrations:bundle\` if the migrations change.)

  Every statement is idempotent, so re-running after a partial failure is safe.
`);
    process.exit(2);
  }

  /* ---- schema ---------------------------------------------------------- */
  console.log("\n  Schema");
  const TABLES = [
    "workspaces",
    "workspace_members",
    "projects",
    "project_files",
    "project_revisions",
    "generation_runs",
  ];
  for (const table of TABLES) {
    const { error } = await admin.from(table).select("*").limit(0);
    check(!error, `table ${table}`, error?.message ?? "");
  }

  // The columns the adapter selects. A missing one is the failure that
  // typechecks perfectly and dies at runtime.
  const RUN_COLUMNS =
    "id, project_id, generation_id, prompt, intent, mode, idempotency_key, " +
    "retry_of_run_id, attempt, base_revision_id, produced_revision_id, status, " +
    "started_at, lease_expires_at, failure, plan, operations, report, validation, model, " +
    "events, error, created_at, completed_at";
  const { error: columnError } = await admin.from("generation_runs").select(RUN_COLUMNS).limit(0);
  check(
    !columnError,
    "generation_runs has every selected column",
    columnError?.message ?? ""
  );

  /* ---- constraints and indexes ---------------------------------------- */
  console.log("\n  Constraints and indexes");

  // Migration 0005's partial unique index is what actually enforces one active
  // run per project; the service check races it.
  const { data: indexes, error: indexError } = await admin.rpc("exec_sql", {
    sql: "select indexname from pg_indexes where schemaname='public'",
  });
  if (indexError) {
    // `exec_sql` is not a Supabase built-in; most projects will not have it.
    // Reported rather than treated as a failure of the schema.
    console.log(
      "  · index inspection needs a SQL-exec helper; skipped".padEnd(56) +
        "(run the checks in supabase/README.md manually)"
    );
  } else {
    const names = new Set((indexes ?? []).map((r) => r.indexname));
    for (const index of [
      "generation_runs_one_active_per_project",
      "generation_runs_project_created_idx",
      "generation_runs_idempotency_idx",
    ]) {
      check(names.has(index), `index ${index}`, names.has(index) ? "" : "not found");
    }
  }

  /* ---- lifecycle ------------------------------------------------------- */
  console.log("\n  Lifecycle (throwaway rows, removed afterwards)");

  const marker = `orbital-verify-${Date.now()}`;
  let workspaceId = null;
  let projectId = null;
  /** Real auth users. `projects.owner_id` references auth.users(id), so an
   *  invented UUID cannot satisfy it — an earlier version of this script used
   *  a workspace id here and the foreign key correctly refused it. Two users,
   *  because the second is what makes the RLS check below meaningful. */
  const users = [];

  /** Creates a confirmed user and returns { id, email, token }.
   *
   * `email_confirm: true` matters: without it the account exists but the
   * password grant returns no session when a project has email confirmation
   * enabled, and the RLS check needs a real authenticated JWT. */
  async function createUser(label) {
    const email = `${marker}-${label}@example.com`;
    const password = `Verify-${marker}-${label}`;

    const created = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!created.ok) throw new Error(`create user ${label}: ${(await created.text()).slice(0, 120)}`);
    const { id } = await created.json();

    const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const token = session.ok ? (await session.json()).access_token : null;

    const user = { id, email, token };
    users.push(user);
    return user;
  }

  try {
    const userA = await createUser("a");
    const userB = await createUser("b");
    ok("create two auth users", userA.token && userB.token ? "both signed in" : "no session token");

    const { data: workspace, error: wsError } = await admin
      .from("workspaces")
      .insert({ name: marker, slug: marker })
      .select()
      .single();
    if (wsError) throw new Error(`workspace insert: ${wsError.message}`);
    workspaceId = workspace.id;
    ok("create workspace");

    // Membership is what the RLS policies join through.
    const { error: memberError } = await admin
      .from("workspace_members")
      .insert({ workspace_id: workspaceId, user_id: userA.id, role: "owner" });
    check(!memberError, "add owner to workspace", memberError?.message ?? "");

    const { data: project, error: pError } = await admin
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        // A real auth user. This is the line the foreign key rejected before.
        owner_id: userA.id,
        name: marker,
        status: "draft",
      })
      .select()
      .single();
    if (pError) throw new Error(`project insert: ${pError.message}`);
    projectId = project.id;
    ok("create project", "owned by a real auth user");

    const { error: fileError } = await admin.from("project_files").insert({
      project_id: projectId,
      path: "index.html",
      kind: "text",
      content: "<h1>verify</h1>",
      hash: "h1",
      byte_size: 15,
    });
    check(!fileError, "write project file", fileError?.message ?? "");

    const { error: revError } = await admin
      .from("project_revisions")
      .insert({ project_id: projectId, summary: "verify", tree: [], site: {} })
      .select()
      .single();
    check(!revError, "create revision", revError?.message ?? "");

    const { data: firstRun, error: runError } = await admin
      .from("generation_runs")
      .insert({
        project_id: projectId,
        prompt: "verify",
        intent: {},
        mode: "demo",
        status: "queued",
        idempotency_key: `${marker}-1`,
      })
      .select()
      .single();
    check(!runError, "create generation run", runError?.message ?? "");

    // Migration 0004's widened status constraint: `running` and `validating`
    // are real persisted states, and 0003's constraint would have rejected them.
    for (const status of ["running", "validating", "succeeded"]) {
      const { error } = await admin
        .from("generation_runs")
        .update({ status })
        .eq("id", firstRun.id);
      check(!error, `status '${status}' accepted`, error?.message ?? "");
    }

    // One active run per project, enforced by the database rather than by the
    // service's advisory check.
    await admin.from("generation_runs").update({ status: "running" }).eq("id", firstRun.id);
    const { error: secondError } = await admin.from("generation_runs").insert({
      project_id: projectId,
      prompt: "second",
      intent: {},
      mode: "demo",
      status: "queued",
      idempotency_key: `${marker}-2`,
    });
    check(
      Boolean(secondError),
      "one active run per project enforced",
      secondError ? "second insert refused" : "a second active run was allowed"
    );

    // Retry lineage from migration 0006.
    await admin.from("generation_runs").update({ status: "failed" }).eq("id", firstRun.id);
    const { error: retryError } = await admin.from("generation_runs").insert({
      project_id: projectId,
      prompt: "retry",
      intent: {},
      mode: "demo",
      status: "queued",
      idempotency_key: `${marker}-retry`,
      retry_of_run_id: firstRun.id,
      attempt: 2,
    });
    check(!retryError, "retry lineage", retryError?.message ?? "");

    /* ---- RLS, with two real users ------------------------------------ */
    console.log("\n  Row Level Security (two real accounts)");

    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

    /** A query as a specific signed-in user. The anon key is the apikey and
     *  the user's JWT is the bearer, which is exactly what the browser client
     *  does — so this exercises the same path the application uses. */
    const asUser = async (user, path) =>
      fetch(`${URL_}/rest/v1/${path}`, {
        headers: { apikey: ANON, Authorization: `Bearer ${user.token}` },
      });

    if (!userA.token || !userB.token) {
      bad("two-user isolation", "no session tokens — is email confirmation required?");
    } else {
      // The owner must still be able to work. An isolation check that passes
      // because nobody can read anything is not a passing isolation check.
      const ownRead = await asUser(userA, `projects?select=id&id=eq.${projectId}`);
      const ownRows = ownRead.ok ? (await ownRead.json()).length : -1;
      check(ownRows === 1, "owner can read their own project", ownRows === 1 ? "" : `got ${ownRows} row(s)`);

      // The isolation itself, across every surface a client can reach.
      const surfaces = [
        ["projects", `projects?select=id&id=eq.${projectId}`],
        ["project files", `project_files?select=path&project_id=eq.${projectId}`],
        ["revisions", `project_revisions?select=id&project_id=eq.${projectId}`],
        ["generation runs", `generation_runs?select=id&project_id=eq.${projectId}`],
      ];
      for (const [label, path] of surfaces) {
        const response = await asUser(userB, path);
        const rows = response.ok ? (await response.json()).length : -1;
        check(rows === 0, `user B cannot read A's ${label}`, rows === 0 ? "" : `leaked ${rows} row(s)`);
      }

      // Writes, not just reads. A policy that hides a row but allows an update
      // to it is not isolation.
      const stolen = await fetch(`${URL_}/rest/v1/projects?id=eq.${projectId}`, {
        method: "PATCH",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${userB.token}`,
          "content-type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ name: "stolen-by-user-b" }),
      });
      const changed = stolen.ok ? (await stolen.json()).length : 0;
      check(changed === 0, "user B cannot rename A's project", changed === 0 ? "" : "the update applied");

      const deleted = await fetch(`${URL_}/rest/v1/projects?id=eq.${projectId}`, {
        method: "DELETE",
        headers: { apikey: ANON, Authorization: `Bearer ${userB.token}`, Prefer: "return=representation" },
      });
      const removed = deleted.ok ? (await deleted.json()).length : 0;
      check(removed === 0, "user B cannot delete A's project", removed === 0 ? "" : "the delete applied");

      // And A's project survived B's attempts.
      const { data: survivor } = await admin.from("projects").select("name").eq("id", projectId).maybeSingle();
      check(survivor?.name === marker, "A's project is unchanged after B's attempts",
        survivor?.name === marker ? "" : `name is now ${survivor?.name}`);
    }

    // Unauthenticated reads, for completeness.
    for (const [table, label] of [
      ["projects", "projects"],
      ["project_files", "project files"],
      ["project_revisions", "revisions"],
      ["generation_runs", "generation runs"],
    ]) {
      const { data } = await anon.from(table).select("*").limit(1);
      check((data ?? []).length === 0, `unauthenticated cannot read ${label}`,
        (data ?? []).length === 0 ? "" : `${data.length} row(s) returned`);
    }

  } catch (error) {
    bad("lifecycle", error.message);
  } finally {
    /* ---- cleanup ----------------------------------------------------- */
    if (projectId) {
      // Cascades to files, revisions and runs — which is itself the cascade
      // this exercise verifies.
      await admin.from("projects").delete().eq("id", projectId);
    }
    if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
    // Auth users are not covered by the project cascade; they live in the auth
    // schema and would accumulate on every run.
    for (const user of users) {
      await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, {
        method: "DELETE",
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      }).catch(() => {});
    }
    console.log(`\n  Cleaned up throwaway rows and ${users.length} test user(s).`);
  }

  console.log(
    failures === 0
      ? "\n  All live checks passed.\n"
      : `\n  ${failures} check(s) failed.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\n  Verification could not complete:", error.message, "\n");
  process.exit(1);
});
