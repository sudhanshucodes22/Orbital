-- 0006 — retry lineage and queryable history.
--
-- Two things: a run can now record that it retries another one, and history
-- can be paged efficiently instead of being capped at "the most recent few".
--
-- Safe to run against a database already carrying 0001–0005. Every statement
-- is idempotent, and the new columns are nullable or defaulted, so existing
-- rows stay valid without a backfill.

-- ------------------------------------------------------ retry lineage -----
--
-- A retry is a new run pointing at the one that failed, never an edit of it —
-- the failure has to stay in history or the history is not a record. The
-- reference is `on delete set null` rather than cascade: deleting a run must
-- not silently take its retries with it.
alter table public.generation_runs
  add column if not exists retry_of_run_id uuid
    references public.generation_runs (id) on delete set null;

-- 1 for a first attempt, 2 for its first retry. Defaulted so rows written
-- before this migration read as first attempts, which is what they were.
alter table public.generation_runs
  add column if not exists attempt integer not null default 1;

alter table public.generation_runs
  drop constraint if exists generation_runs_attempt_positive;
alter table public.generation_runs
  add constraint generation_runs_attempt_positive check (attempt >= 1);

-- A run may not retry itself. Cheap to state, and the alternative is a cycle
-- that makes lineage walks non-terminating.
alter table public.generation_runs
  drop constraint if exists generation_runs_retry_not_self;
alter table public.generation_runs
  add constraint generation_runs_retry_not_self check (retry_of_run_id is null or retry_of_run_id <> id);

-- Finding the retries of a run. Partial, because the overwhelming majority of
-- runs are not retries and there is no reason to index their nulls.
create index if not exists generation_runs_retry_of_idx
  on public.generation_runs (retry_of_run_id)
  where retry_of_run_id is not null;

-- ---------------------------------------------------- history queries -----
--
-- Backs RunRepository.query: filter by project, order by created_at
-- descending, page with a keyset cursor. The composite index the cursor needs
-- — `(project_id, created_at desc)` — already exists as
-- `generation_runs_project_created_idx`, created in 0003. It is what makes the
-- cursor an index seek rather than a scan-and-discard, so it is load-bearing
-- for paging even though this migration does not create it.

-- Status filtering within a project ("show me only the failures"). Separate
-- from the index above because leading with status would make the common
-- unfiltered query use a worse plan.
create index if not exists generation_runs_project_status_created_idx
  on public.generation_runs (project_id, status, created_at desc);

-- Finding the run that produced a given revision — the link the diff view
-- follows from a revision back to its generation.
create index if not exists generation_runs_produced_revision_idx
  on public.generation_runs (produced_revision_id)
  where produced_revision_id is not null;

comment on column public.generation_runs.retry_of_run_id is
  'The run this one retries. Points at the lineage root, not the immediate predecessor.';
comment on column public.generation_runs.attempt is
  'Attempt number, from 1. Part of the idempotency key so a retry does not collide with the original.';
