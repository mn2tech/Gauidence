-- Work Memory Phase 1: projects + end-of-session capture.

create table if not exists public.work_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid references public.guardian_profiles (id) on delete set null,
  name text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'waiting', 'blocked', 'done', 'archived')),
  mission text,
  current_step text,
  next_action text,
  blockers text,
  priority smallint not null default 0,
  estimated_resume_minutes smallint,
  resume_context jsonb,
  last_activity_at timestamptz,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_projects_owner_status_activity_idx
  on public.work_projects (owner_user_id, status, last_activity_at desc nulls last);

create index if not exists work_projects_owner_updated_idx
  on public.work_projects (owner_user_id, updated_at desc);

create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.work_projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz not null default now(),
  accomplished text,
  next_step text,
  blockers text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists work_sessions_project_ended_idx
  on public.work_sessions (project_id, ended_at desc);

create index if not exists work_sessions_owner_ended_idx
  on public.work_sessions (owner_user_id, ended_at desc);

alter table public.work_projects enable row level security;
alter table public.work_sessions enable row level security;

create policy "Users can view own work projects"
  on public.work_projects for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert own work projects"
  on public.work_projects for insert
  with check (
    auth.uid() = owner_user_id
    and (
      profile_id is null
      or public.owns_guardian_profile(profile_id)
    )
  );

create policy "Users can update own work projects"
  on public.work_projects for update
  using (auth.uid() = owner_user_id)
  with check (
    auth.uid() = owner_user_id
    and (
      profile_id is null
      or public.owns_guardian_profile(profile_id)
    )
  );

create policy "Users can delete own work projects"
  on public.work_projects for delete
  using (auth.uid() = owner_user_id);

create policy "Users can view own work sessions"
  on public.work_sessions for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert own work sessions"
  on public.work_sessions for insert
  with check (
    auth.uid() = owner_user_id
    and exists (
      select 1
      from public.work_projects p
      where p.id = project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "Users can update own work sessions"
  on public.work_sessions for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "Users can delete own work sessions"
  on public.work_sessions for delete
  using (auth.uid() = owner_user_id);

comment on table public.work_projects is
  'User work-intent projects: mission, step, next action, blockers.';
comment on table public.work_sessions is
  'End-of-session captures for Work Memory continuity.';
