-- Orbital — read-only diagnosis. Changes nothing.
--
-- The evidence from outside the database is contradictory:
--
--   · information_schema.role_table_grants returned 12 rows, so the grants
--     exist in the database the SQL Editor is connected to.
--   · PostgREST's OpenAPI spec is privilege-filtered — it shows 0 paths for
--     anon and 7 for service_role — so PostgREST also believes service_role
--     has access.
--   · Yet every actual SELECT returns 42501 permission denied, uniformly, on
--     eight consecutive attempts.
--
-- Those three cannot all be true of one database. This file asks Postgres
-- directly, which settles it. Run it and paste the output back.

-- 1. Which database and role is the SQL Editor actually using?
--    If this is not the same database PostgREST serves, everything above is
--    explained at once.
select current_database()            as database,
       current_user                  as current_user,
       session_user                  as session_user,
       inet_server_addr()::text      as server_addr;

-- 2. The authoritative privilege check. information_schema can list a grant
--    that a later REVOKE removed, or one made to a similarly-named role;
--    has_table_privilege answers the question Postgres itself asks at query
--    time. If any of these is false, the grant is not effective regardless of
--    what the catalog listing showed.
select t.table_name,
       has_table_privilege('service_role',  'public.' || t.table_name, 'SELECT') as service_role_select,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'SELECT') as authenticated_select
  from (values ('workspaces'),('workspace_members'),('projects'),
               ('project_files'),('project_revisions'),('generation_runs')) as t(table_name)
 order by t.table_name;

-- 3. Does service_role still bypass RLS, and does it have schema usage?
select rolname, rolbypassrls, rolcanlogin
  from pg_roles
 where rolname in ('anon','authenticated','service_role','authenticator')
 order by rolname;

select has_schema_privilege('service_role',  'public', 'USAGE') as service_role_schema_usage,
       has_schema_privilege('authenticated', 'public', 'USAGE') as authenticated_schema_usage;

-- 4. Is `authenticator` — the role PostgREST logs in as — able to become
--    service_role at all? If it cannot, PostgREST would run the query as
--    itself, and `authenticator` has no grants by design.
select r.rolname as member, g.rolname as can_become
  from pg_auth_members m
  join pg_roles r on r.oid = m.member
  join pg_roles g on g.oid = m.roleid
 where r.rolname = 'authenticator'
 order by g.rolname;
