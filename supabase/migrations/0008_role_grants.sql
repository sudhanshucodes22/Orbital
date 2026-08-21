-- 0008 — table privileges for the Supabase roles.
--
-- Every earlier migration created tables and wrote RLS policies, but never
-- granted table privileges to anyone. That produced "permission denied for
-- table projects" even for the service role, which was confusing because the
-- service role is documented as bypassing RLS.
--
-- It does — but RLS is not what was refusing. Postgres checks GRANTs first: a
-- role with no privilege on a table is rejected before any policy is
-- consulted. So the policies were never reached, and the failure looked like
-- an RLS problem while actually being the absence of one.
--
-- Supabase normally attaches default privileges so that tables created in
-- `public` are granted to anon, authenticated and service_role automatically.
-- That did not happen here, and relying on it is fragile in any case: the
-- schema should state what it needs rather than inherit it from a project
-- setting that a restore or a new environment might not reproduce.
--
-- ## This does not weaken Row Level Security
--
-- A GRANT permits a role to *attempt* access. RLS then decides which rows it
-- actually sees. The two are complementary, and without the grant the policies
-- are dead code. Every policy from 0001 and 0003 remains exactly as written.
--
-- ## anon is deliberately granted nothing
--
-- Orbital has no anonymous surface: every read and write happens after sign-in,
-- at which point the request carries the user's JWT and Postgres sees the role
-- `authenticated`. The anon key exists to perform the sign-in itself, not to
-- read application data. Granting it table access would create a second way in
-- that no policy audit covers, so it gets none — and a query attempted with a
-- bare anon key fails on privilege, before RLS.
--
-- Idempotent: GRANT is naturally repeatable.

-- Both roles need to see the schema at all before any table grant applies.
grant usage on schema public to authenticated, service_role;

-- The signed-in user. RLS restricts every one of these to rows the caller
-- owns; the policies are in 0001 and 0003 and are unchanged.
grant select, insert, update, delete on public.workspaces        to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.projects          to authenticated;
grant select, insert, update, delete on public.project_files     to authenticated;
grant select, insert, update, delete on public.project_revisions to authenticated;
grant select, insert, update, delete on public.generation_runs   to authenticated;

-- The server-side role: the worker, which has no session and acts across all
-- projects, and the admin client used by tooling. It bypasses RLS by design,
-- which is why the key it comes from is server-only and never shipped to a
-- browser.
grant select, insert, update, delete on public.workspaces        to service_role;
grant select, insert, update, delete on public.workspace_members to service_role;
grant select, insert, update, delete on public.projects          to service_role;
grant select, insert, update, delete on public.project_files     to service_role;
grant select, insert, update, delete on public.project_revisions to service_role;
grant select, insert, update, delete on public.generation_runs   to service_role;

-- Anything added later inherits the same shape, so a new table is not a new
-- outage. Scoped to objects created by the role that runs migrations.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- Deliberately absent: any grant to `anon`. See the note above.
