-- Orbital — migration 0008 only. Paste this whole file and run it.
--
-- Why just this one: the live database was probed and the other migrations are
-- present — all six tables exist, the orbital-artifacts bucket exists, and
-- claim_generation_run() responds. Only the grants from 0008 are missing, and
-- every table returns "42501 permission denied" for both service_role and
-- authenticated as a result.
--
-- Nothing here can fail on ownership. There is no trigger on auth.users, no
-- extension, no table creation — only GRANT, which the SQL Editor may always
-- issue for tables in the public schema. If the full bundle stopped early on
-- some earlier statement, this file sidesteps that entirely.
--
-- This does not weaken Row Level Security. A GRANT lets a role attempt access;
-- the policies from 0001 and 0003 still decide which rows it sees, and they
-- are not touched here. Without the grant those policies were unreachable,
-- because Postgres checks privileges before it consults a policy.
--
-- `anon` is deliberately granted nothing: Orbital signs in before reading
-- anything, and a grant there would be a way in that no policy audit covers.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.workspaces        to authenticated, service_role;
grant select, insert, update, delete on public.workspace_members to authenticated, service_role;
grant select, insert, update, delete on public.projects          to authenticated, service_role;
grant select, insert, update, delete on public.project_files     to authenticated, service_role;
grant select, insert, update, delete on public.project_revisions to authenticated, service_role;
grant select, insert, update, delete on public.generation_runs   to authenticated, service_role;

-- So a table added later is not a new outage.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Did it work?
-- ---------------------------------------------------------------------------
--
-- Expect 12 rows: six tables × two roles. Anything missing is a grant that did
-- not apply.

select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('authenticated', 'service_role')
   and table_name in ('workspaces','workspace_members','projects',
                      'project_files','project_revisions','generation_runs')
 group by grantee, table_name
 order by grantee, table_name;
