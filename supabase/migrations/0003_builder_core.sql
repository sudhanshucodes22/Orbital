-- Orbital — builder core
--
-- STATUS: proposed, not yet wired.
--
-- No adapter reads or writes these tables. lib/server/container.ts still
-- resolves files, runs and revisions to the unconfigured adapters on the
-- Supabase path, which throw NotConfiguredError. Applying this migration adds
-- the tables; it does not turn the capability on. That happens when
-- lib/server/supabase/ gains repositories implementing ProjectFileRepository,
-- RunRepository and RevisionRepository.
--
-- It is written now because the shape is what Milestone 1 had to decide, and
-- deciding it in TypeScript while leaving the database to guess later is how
-- the two drift.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------- tables --

-- The working tree. One row per file per project.
--
-- Content is inline text. Binary assets carry a storage_key and leave content
-- null — the same split as domain/file.ts, for the same reason: the model
-- reads and writes text, and putting a 4MB image in a text column to keep the
-- shape uniform would be paying a real cost for a cosmetic one.
create table if not exists public.project_files (
  project_id  uuid not null references public.projects (id) on delete cascade,
  path        text not null check (char_length(path) between 1 and 400),
  kind        text not null default 'text' check (kind in ('text', 'binary')),
  content     text,
  storage_key text,
  hash        text not null,
  byte_size   integer not null default 0 check (byte_size >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (project_id, path),
  -- Exactly one of the two carries the bytes.
  constraint project_files_content_xor_key check (
    (kind = 'text'   and content is not null and storage_key is null) or
    (kind = 'binary' and content is null     and storage_key is not null)
  )
);

create index if not exists project_files_project_idx
  on public.project_files (project_id);

-- Revisions. Promoted from "arrives with the generation engine" in 0001.
--
-- `tree` is the frozen snapshot as jsonb. A full snapshot rather than a diff:
-- restoring a revision must not depend on replaying every revision before it,
-- and at the size of a generated site the storage cost is not worth the
-- fragility. Diffs are computed between snapshots on read, not stored.
create table if not exists public.project_revisions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  parent_id     uuid references public.project_revisions (id) on delete set null,
  generation_id uuid,
  summary       text not null default '',
  tree          jsonb not null default '[]'::jsonb,
  -- The legacy GeneratedSite blob. Kept so the existing preview route keeps
  -- working during the transition; drop it once the preview reads the tree.
  site          jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists project_revisions_project_created_idx
  on public.project_revisions (project_id, created_at desc);

-- Generation runs. The audit trail: what was asked, what was planned, which
-- operations came back and what happened to each.
create table if not exists public.generation_runs (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  generation_id        uuid,
  prompt               text not null default '',
  base_revision_id     uuid references public.project_revisions (id) on delete set null,
  produced_revision_id uuid references public.project_revisions (id) on delete set null,
  status               text not null default 'queued'
                       check (status in ('queued','reading','understanding','building',
                                         'succeeded','failed','cancelled')),
  plan                 jsonb,
  operations           jsonb not null default '[]'::jsonb,
  report               jsonb,
  -- Null when no model was involved, which is the honest record for anything
  -- the template engine produced.
  model                jsonb,
  events               jsonb not null default '[]'::jsonb,
  error                text,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

create index if not exists generation_runs_project_created_idx
  on public.generation_runs (project_id, created_at desc);

-- -------------------------------------------------------------- triggers --

drop trigger if exists project_files_touch_updated_at on public.project_files;
create trigger project_files_touch_updated_at
  before update on public.project_files
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- RLS --
--
-- All three tables are reached only through their project, so every policy is
-- the same question: does the caller own the project this row belongs to?
-- Written as an EXISTS against projects, whose own policy is already
-- owner-only, so there is no new trust path and no policy recursion.

alter table public.project_files     enable row level security;
alter table public.project_revisions enable row level security;
alter table public.generation_runs   enable row level security;

drop policy if exists project_files_own on public.project_files;
create policy project_files_own
  on public.project_files for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_files.project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_files.project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists project_revisions_own on public.project_revisions;
create policy project_revisions_own
  on public.project_revisions for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_revisions.project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_revisions.project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists generation_runs_own on public.generation_runs;
create policy generation_runs_own
  on public.generation_runs for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = generation_runs.project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = generation_runs.project_id and p.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------ constraint --
--
-- 0001 left projects.current_revision_id unconstrained because the table it
-- points at did not exist. It does now.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_current_revision_fk'
  ) then
    alter table public.projects
      add constraint projects_current_revision_fk
      foreign key (current_revision_id)
      references public.project_revisions (id)
      on delete set null;
  end if;
end $$;
