# Supabase setup

Everything in the application is implemented. What is missing is a project to
point it at. These are the only steps that need a human.

## 1. Create a project

<https://supabase.com/dashboard> → New project. Note the region; keep it near
your users.

## 2. Apply the migrations

**Fastest path — one paste.** `supabase/ALL_MIGRATIONS.sql` is every migration
concatenated in order, wrapped in a transaction. Paste the whole file into the
**SQL Editor** and run it once. Regenerate it with `npm run migrations:bundle`
whenever the migrations change.

Or paste the files individually in order, or use the CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

| File | Creates |
|------|---------|
| `0001_initial_schema.sql` | `workspaces`, `workspace_members`, `projects`, the sign-up trigger, the `updated_at` trigger, and all RLS policies |
| `0002_storage.sql` | the private `orbital-artifacts` bucket with a 25 MB limit and a MIME allow-list |
| `0003_builder_core.sql` | `project_files`, `project_revisions`, `generation_runs`, and their RLS policies |
| `0004_durable_runs.sql` | the columns a run needs to outlive its request (`intent`, `mode`, `idempotency_key`, `started_at`, `lease_expires_at`, `failure`), the widened status constraint, and the idempotency index |
| `0005_worker_and_concurrency.sql` | `claim_generation_run()`, the one-active-run-per-project unique index, and the worker's inbox index |
| `0006_retry_and_history.sql` | `retry_of_run_id`, `attempt`, and the indexes history paging and retry lineage read |

**Order matters** — each assumes the ones before it. All are idempotent, so
re-running after a partial failure is safe and is the intended recovery path.

## 3. Collect four values

**Settings → API**

| Value | Goes to |
|-------|---------|
| Project URL | `SUPABASE_URL` |
| `anon` / publishable key | `SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` |
| (fixed) | `STORAGE_BUCKET=orbital-artifacts` |

Put them in `.env.local`, which is gitignored. The `service_role` key bypasses
Row Level Security — treat it like a root password and never expose it to a
browser.

## 4. Decide on email confirmation

**Authentication → Providers → Email.** With confirmation on (the default),
sign-up returns no session and the form says to check the inbox. Turning it
off makes sign-up log the user straight in, which is easier while developing.

## 5. Check it worked

```bash
npm run build && npm run start
curl -s localhost:3000/api/health
```

`auth`, `database` and `storage` should all report `true`. Then sign up — a
personal workspace is created by the trigger — and `/projects` becomes a real,
working screen.

## Security model

Row Level Security is the boundary, not the service layer. Services check
roles so errors are useful; the policies are what hold if a service is ever
bypassed.

- A user reads only their own `workspace_members` rows.
- A workspace is visible only to its members.
- A project is readable, writable and deletable **only by its owner**. The
  insert policy pins `owner_id` to `auth.uid()`, so a forged owner in the
  request body is rejected by the database rather than trusted, and the update
  policy repeats the check so ownership cannot be reassigned.
- Another user's project is indistinguishable from one that does not exist:
  RLS returns no row, the service raises `NotFound`, and the route renders
  404. No existence oracle.
- The storage bucket is private with **no** policies for authenticated users,
  so only the service role can reach it. Uploads and reads both go through
  short-lived signed URLs minted server-side after the request has been
  authorised.

## Grants are separate from policies

If a query fails with `42501 permission denied` — even using the service role,
which bypasses RLS — the cause is a missing **GRANT**, not a policy problem.
Postgres checks privileges first, so a role with no grant on a table is refused
before any policy is consulted. The policies are then unreachable rather than
wrong.

`supabase/APPLY_0008_GRANTS.sql` contains only the grants and ends with a query
listing what applied. `npm run verify` detects this state specifically and says
so, rather than reporting it as a connection failure.

**If that query returns 12 rows and the API still says permission denied**, the
grants are applied and PostgREST simply has not noticed. It answers from a
cached view of the schema that includes privileges, and a `GRANT` does not
always prompt a reload. Fix it with

```sql
notify pgrst, 'reload schema';
```

or the *Reload schema cache* control in the project's API settings. Neither
re-applies anything, and neither touches RLS.

## Applying migrations needs a credential the app does not have

`SUPABASE_URL` and the two API keys are PostgREST credentials. They can read
and write rows; they cannot execute DDL. Creating tables needs either the SQL
Editor (which runs as `postgres`) or the database password for
`supabase db push`.

That is a deliberate boundary rather than an inconvenience: an application that
could rewrite its own schema with the key it ships to production would be a
larger problem than a manual migration step.

## Verification status — LIVE VERIFIED

`npm run verify` passes against the live project. It creates two real auth
users, a workspace, a project, a file, a revision and a generation run;
exercises the status constraint, the one-active-run index and retry lineage;
then checks isolation with both users' real JWTs and removes everything it
made, users included.

Two-user isolation is now measured rather than asserted. User B cannot read A's
projects, files, revisions or runs, cannot rename A's project and cannot delete
it — and A's project is confirmed unchanged afterwards. The owner can still
read their own project, which matters: an isolation check that passes because
nobody can read anything is not a passing check.

### The older caveat, kept because it explains the tooling

## Historical: verification status before the live run

**The SQL has still never been executed.** This machine has no `psql`, no
Supabase CLI, no Docker, and no `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY`. Nothing here has been run against a live Postgres,
and no claim in this file should be read as "observed".

### What *is* checked automatically

`tests/schema.test.ts` runs in the normal suite and checks, statically:

- every column the Supabase adapter selects is created by some migration —
  this is the failure that typechecks perfectly and then dies at runtime with
  `column does not exist`, because `RUN_COLUMNS` is just a string;
- every run status the pipeline writes is permitted by the status constraint
  (0003's predated `running` and `validating`; 0004 widened it);
- the keyset-pagination index and the one-active-run unique index exist;
- every `create` / `add column` is `if not exists`, so "idempotent" is enforced
  rather than asserted;
- migration numbering has no gaps or duplicates.

It is a real check — deliberately verified by introducing drift and watching it
fail — but it reads SQL as text. It cannot catch a syntax error Postgres would
reject, a policy that does not do what it says, or a constraint that is
unsatisfiable in practice.

### What still needs a live project

- Executing the migrations at all. The first `db push` remains their first real
  test.
- **RLS isolation.** Every claim in *Security model* above is by construction.
  Verify it with two accounts: sign in as B and request A's project id, A's
  revision id via `/api/demo/preview/<id>`, and A's run ids. All must 404.
- `claim_generation_run()` under genuine concurrency.
- That the service-role worker can claim runs across all projects while a
  signed-in user cannot claim anyone else's.
