-- 0007 — the validator's verdict, on success as well as failure.
--
-- Validation already ran on every generation, but its result was only kept
-- when it *refused*, tucked inside `failure.validation`. So a change that was
-- applied with warnings — a page linking to something nobody wrote, say — had
-- those warnings computed and then thrown away, which made the checks
-- invisible exactly when they were informative rather than fatal.
--
-- Safe to run against a database carrying 0001–0006. Nullable, so existing
-- rows stay valid; they read as "no validation recorded", which is true.

alter table public.generation_runs
  add column if not exists validation jsonb;

comment on column public.generation_runs.validation is
  'ValidationResult for this run: errors, warnings and how many operations were checked. Recorded whether or not it passed.';
