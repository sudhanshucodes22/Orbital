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
-- Did it work? (authoritative)
-- ---------------------------------------------------------------------------
--
-- This block previously queried information_schema.role_table_grants, which
-- returned twelve rows while has_table_privilege() reported false for every
-- table and both roles. That is a false pass, and it cost several rounds of
-- misdiagnosis: the catalog listing and the privilege the planner actually
-- enforces are not the same question.
--
-- has_table_privilege() is what Postgres consults at query time, so it is the
-- only answer that matters. This raises an exception rather than returning
-- rows, so the run cannot appear to succeed while leaving the grants absent.

do $$
declare
  t text;
  missing text[] := '{}';
begin
  foreach t in array array['workspaces','workspace_members','projects',
                           'project_files','project_revisions','generation_runs']
  loop
    if not has_table_privilege('service_role', 'public.' || t, 'SELECT') then
      missing := missing || ('service_role -> ' || t);
    end if;
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      missing := missing || ('authenticated -> ' || t);
    end if;
  end loop;

  if array_length(missing, 1) is not null then
    raise exception 'GRANTS DID NOT TAKE EFFECT: %', array_to_string(missing, ', ');
  end if;

  raise notice 'All grants verified with has_table_privilege(). Both roles can SELECT all six tables.';
end $$;

-- And the same check as a result set, so success is visible as well as silent.
select t.table_name,
       has_table_privilege('service_role',  'public.' || t.table_name, 'SELECT') as service_role,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'SELECT') as authenticated
  from (values ('workspaces'),('workspace_members'),('projects'),
               ('project_files'),('project_revisions'),('generation_runs')) as t(table_name)
 order by t.table_name;
