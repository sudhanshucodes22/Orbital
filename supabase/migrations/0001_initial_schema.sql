-- Orbital — initial schema
--
-- Apply with the Supabase CLI (`supabase db push`) or by pasting into the SQL
-- editor of a new project. Idempotent: safe to re-run.
--
-- Model. Every user gets a personal workspace on sign-up, created by a
-- trigger. That is how "my projects" is expressed today, while leaving the
-- shape in place for shared workspaces later without a migration of the
-- projects table.
--
-- Security. Row Level Security is the real boundary. The service layer also
-- checks roles, but that is for good error messages; if a service is ever
-- bypassed these policies still hold. Projects are owner-only today, matching
-- the requirement that a user can only reach their own.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tables --

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member'
               check (role in ('owner', 'admin', 'member', 'viewer')),
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.projects (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  -- Denormalised beside workspace_id so a row can be authorised without a
  -- join. The RLS policies below depend on it.
  owner_id            uuid not null references auth.users (id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 60),
  description         text check (description is null or char_length(description) <= 280),
  status              text not null default 'draft'
                      check (status in ('draft', 'generating', 'ready', 'failed')),
  -- Revisions arrive with the generation engine. Left nullable and
  -- unconstrained so that table can be added without altering this one.
  current_revision_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists projects_workspace_updated_idx
  on public.projects (workspace_id, updated_at desc);
create index if not exists projects_owner_idx
  on public.projects (owner_id);
create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);

-- -------------------------------------------------------------- triggers --

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- Personal workspace on sign-up.
--
-- security definer because the trigger runs before the new user has any
-- session, so RLS would reject both inserts. search_path is pinned so the
-- elevated function cannot be redirected at a shadowed schema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
  label text;
begin
  label := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    split_part(coalesce(new.email, 'account'), '@', 1)
  );

  insert into public.workspaces (name, slug)
  values (
    left(label, 60) || '''s workspace',
    'w-' || replace(new.id::text, '-', '')
  )
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------- RLS --

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects          enable row level security;

-- A user sees only their own membership rows. Deliberately not "rows for any
-- workspace I belong to": that form makes the policy query its own table and
-- recurse.
drop policy if exists workspace_members_select_own on public.workspace_members;
create policy workspace_members_select_own
  on public.workspace_members for select
  using (user_id = auth.uid());

-- Workspaces are visible when the caller has a membership row. This reads
-- workspace_members, whose policy does not read workspaces, so there is no
-- cycle.
drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspaces.id
        and m.user_id = auth.uid()
    )
  );

-- Projects: owner only, for every verb.
--
-- The insert check pins owner_id to the caller, so a forged owner_id in the
-- request body is rejected by the database rather than trusted. The update
-- policy repeats it in `with check` so ownership cannot be reassigned.
drop policy if exists projects_select_own on public.projects;
create policy projects_select_own
  on public.projects for select
  using (owner_id = auth.uid());

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own
  on public.projects for insert
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = projects.workspace_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own
  on public.projects for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own
  on public.projects for delete
  using (owner_id = auth.uid());
