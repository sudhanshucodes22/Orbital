-- Orbital — worker trigger and the active-run invariant
--
-- Two gaps left by 0004:
--
--   1. `findActive` was advisory. It was a plain SELECT, so two submits
--      arriving in the same instant could both read "no active run" and both
--      insert. Application code cannot close that window; only a constraint
--      can.
--
--   2. `claim_generation_run` required `auth.uid()` to own the project, which
--      is right for a user polling their own run and wrong for a worker. A
--      scheduler has no session, so under 0004 it could never claim anything.
--
-- Idempotent: safe to re-run. Assumes 0003 and 0004 have been applied.

-- ------------------------------------------- one active run per project ---
--
-- A partial unique index is the whole mechanism. Postgres refuses the second
-- concurrent insert rather than the application noticing afterwards, so the
-- invariant holds under any interleaving, including two separate processes.
--
-- Terminal runs are excluded, so a project accumulates history freely and only
-- ever has at most one row in flight.
--
-- Note this deliberately does NOT exclude expired leases: an index predicate
-- must be immutable, and `now()` is not. Stale runs are handled where they can
-- be — `listClaimable` treats an expired lease as claimable, so a worker takes
-- the abandoned run over rather than a new one being created beside it.
create unique index if not exists generation_runs_one_active_per_project
  on public.generation_runs (project_id)
  where status not in ('succeeded', 'failed', 'cancelled');

-- ------------------------------------------------------ worker claiming ---
--
-- Replaces the 0004 definition. Same conditional UPDATE — still the only place
-- the lease decision can be made atomically — but the ownership test now
-- accepts either the project's owner (a user polling their own run) or the
-- service role (a worker draining the queue).
--
-- security definer with a pinned search_path, so the elevated function cannot
-- be redirected at a shadowed schema.
create or replace function public.claim_generation_run(
  p_run_id uuid,
  p_lease_ms integer
)
returns setof public.generation_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.generation_runs r
     set status           = 'running',
         started_at       = coalesce(r.started_at, now()),
         lease_expires_at = now() + make_interval(secs => p_lease_ms / 1000.0)
   where r.id = p_run_id
     and r.status not in ('succeeded', 'failed', 'cancelled')
     and (r.lease_expires_at is null or r.lease_expires_at < now())
     and (
       -- The worker: no session, acts on the whole queue.
       auth.role() = 'service_role'
       -- Or the owner, polling their own run.
       or exists (
         select 1 from public.projects p
         where p.id = r.project_id and p.owner_id = auth.uid()
       )
     )
  returning r.*;
end;
$$;

revoke all on function public.claim_generation_run(uuid, integer) from public;
grant execute on function public.claim_generation_run(uuid, integer) to authenticated;
grant execute on function public.claim_generation_run(uuid, integer) to service_role;

-- ------------------------------------------------------- worker inbox -----
--
-- Backs listClaimable: queued runs and runs whose lease has lapsed, oldest
-- first. Partial so it stays small no matter how much history accumulates.
create index if not exists generation_runs_claimable_idx
  on public.generation_runs (created_at)
  where status not in ('succeeded', 'failed', 'cancelled');
