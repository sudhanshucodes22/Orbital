-- Orbital — durable generation runs
--
-- 0003 proposed the builder-core tables while generation still ran inline. The
-- pipeline made a run into a job that outlives the request that created it, so
-- the row needs the state a worker reads on the way back in: what it was asked
-- to do, who is holding it, when they took it, and why it failed.
--
-- Idempotent: safe to re-run. Assumes 0003 has been applied.

-- ------------------------------------------------------- generation_runs --

alter table public.generation_runs
  -- The original request. A durable run must be resumable from its own row,
  -- not from whatever was in the submitting request's memory.
  add column if not exists intent jsonb not null default '{}'::jsonb,
  -- demo | model. Recorded per run so history cannot imply a model was
  -- involved when none was.
  add column if not exists mode text not null default 'demo'
    check (mode in ('demo', 'model')),
  -- Deduplicates accidental double submissions.
  add column if not exists idempotency_key text,
  -- When a worker first claimed the run.
  add column if not exists started_at timestamptz,
  -- Lease held by the worker currently advancing this run. A row whose lease
  -- has passed was abandoned by a dead process and may be reclaimed; this is
  -- what makes the pipeline durable without a queue service.
  add column if not exists lease_expires_at timestamptz,
  -- Structured failure: { stage, message, validation? }. Never a credential —
  -- provider errors are translated at the adapter boundary before they reach
  -- here, precisely so an API key cannot end up persisted in a run row.
  add column if not exists failure jsonb;

-- The status set grew with the pipeline: running and validating are real
-- persisted states now, not just event labels.
alter table public.generation_runs drop constraint if exists generation_runs_status_check;
alter table public.generation_runs
  add constraint generation_runs_status_check
  check (status in (
    'queued', 'running', 'reading', 'understanding', 'building',
    'validating', 'succeeded', 'failed', 'cancelled'
  ));

-- Idempotency is enforced by the database, not by a read-then-write in
-- application code: two simultaneous submits would both see "no existing run"
-- and both insert. A unique index makes the second one fail instead.
create unique index if not exists generation_runs_idempotency_idx
  on public.generation_runs (project_id, idempotency_key)
  where idempotency_key is not null;

-- Backs findActive and the claim query.
create index if not exists generation_runs_active_idx
  on public.generation_runs (project_id, status)
  where status not in ('succeeded', 'failed', 'cancelled');

create index if not exists generation_runs_generation_idx
  on public.generation_runs (generation_id);

-- ------------------------------------------------------ atomic claim ------
--
-- The concurrency primitive. Doing this as SELECT-then-UPDATE in TypeScript
-- would leave a window where two workers both see a free lease and both take
-- it; a single conditional UPDATE cannot. Returns the row only to the caller
-- that won.
--
-- security definer with a pinned search_path, and it re-checks ownership
-- itself — it must not become a way to touch another user's run.
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
     and exists (
       select 1 from public.projects p
       where p.id = r.project_id and p.owner_id = auth.uid()
     )
  returning r.*;
end;
$$;

revoke all on function public.claim_generation_run(uuid, integer) from public;
grant execute on function public.claim_generation_run(uuid, integer) to authenticated;

-- ---------------------------------------------------------- revisions -----

-- Restore reads this; a revision without one can be shown but not restored.
alter table public.project_revisions
  add column if not exists tree jsonb not null default '[]'::jsonb;
