-- Guardian Experts Framework: user installations, progress, attempts, activity.

create table if not exists public.user_experts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  expert_id text not null,
  expert_version text not null,
  status text not null default 'active',
  installed_at timestamptz not null default now(),
  last_opened_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, profile_id, expert_id)
);

create index if not exists user_experts_user_idx
  on public.user_experts (user_id, installed_at desc);

create index if not exists user_experts_profile_idx
  on public.user_experts (profile_id);

create table if not exists public.expert_module_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_expert_id uuid not null references public.user_experts (id) on delete cascade,
  module_id text not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'skipped')),
  progress_percent integer not null default 0
    check (progress_percent >= 0 and progress_percent <= 100),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_expert_id, module_id)
);

create index if not exists expert_module_progress_user_expert_idx
  on public.expert_module_progress (user_expert_id, module_id);

create table if not exists public.expert_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_expert_id uuid not null references public.user_experts (id) on delete cascade,
  quiz_id text not null,
  score integer not null,
  correct_answers integer not null,
  total_questions integer not null,
  answers jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now()
);

create index if not exists expert_quiz_attempts_user_expert_idx
  on public.expert_quiz_attempts (user_expert_id, quiz_id, completed_at desc);

create table if not exists public.expert_scenario_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_expert_id uuid not null references public.user_experts (id) on delete cascade,
  scenario_id text not null,
  selected_choice_index integer,
  was_correct boolean,
  completed_at timestamptz not null default now()
);

create index if not exists expert_scenario_attempts_user_expert_idx
  on public.expert_scenario_attempts (user_expert_id, scenario_id, completed_at desc);

create table if not exists public.expert_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_expert_id uuid not null references public.user_experts (id) on delete cascade,
  status text not null default 'active',
  question_ids jsonb not null default '[]'::jsonb,
  responses jsonb not null default '[]'::jsonb,
  feedback jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists expert_interview_sessions_user_expert_idx
  on public.expert_interview_sessions (user_expert_id, started_at desc);

create table if not exists public.expert_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_expert_id uuid not null references public.user_experts (id) on delete cascade,
  activity_type text not null,
  content_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists expert_activity_user_expert_idx
  on public.expert_activity (user_expert_id, created_at desc);

-- RLS

alter table public.user_experts enable row level security;
alter table public.expert_module_progress enable row level security;
alter table public.expert_quiz_attempts enable row level security;
alter table public.expert_scenario_attempts enable row level security;
alter table public.expert_interview_sessions enable row level security;
alter table public.expert_activity enable row level security;

create or replace function public.user_expert_accessible(target_user_expert_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_experts ue
    where ue.id = target_user_expert_id
      and ue.user_id = auth.uid()
      and public.can_access_guardian_profile(ue.profile_id)
  );
$$;

-- user_experts

drop policy if exists "Users can view accessible expert installations" on public.user_experts;
create policy "Users can view accessible expert installations"
  on public.user_experts for select
  using (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

drop policy if exists "Users can insert own expert installations" on public.user_experts;
create policy "Users can insert own expert installations"
  on public.user_experts for insert
  with check (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

drop policy if exists "Users can update own expert installations" on public.user_experts;
create policy "Users can update own expert installations"
  on public.user_experts for update
  using (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  )
  with check (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

drop policy if exists "Users can delete own expert installations" on public.user_experts;
create policy "Users can delete own expert installations"
  on public.user_experts for delete
  using (
    auth.uid() = user_id
    and public.can_access_guardian_profile(profile_id)
  );

-- expert_module_progress

drop policy if exists "Users can view own expert module progress" on public.expert_module_progress;
create policy "Users can view own expert module progress"
  on public.expert_module_progress for select
  using (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

drop policy if exists "Users can insert own expert module progress" on public.expert_module_progress;
create policy "Users can insert own expert module progress"
  on public.expert_module_progress for insert
  with check (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

drop policy if exists "Users can update own expert module progress" on public.expert_module_progress;
create policy "Users can update own expert module progress"
  on public.expert_module_progress for update
  using (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  )
  with check (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

-- expert_quiz_attempts

drop policy if exists "Users can view own expert quiz attempts" on public.expert_quiz_attempts;
create policy "Users can view own expert quiz attempts"
  on public.expert_quiz_attempts for select
  using (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

drop policy if exists "Users can insert own expert quiz attempts" on public.expert_quiz_attempts;
create policy "Users can insert own expert quiz attempts"
  on public.expert_quiz_attempts for insert
  with check (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

-- expert_scenario_attempts

drop policy if exists "Users can view own expert scenario attempts" on public.expert_scenario_attempts;
create policy "Users can view own expert scenario attempts"
  on public.expert_scenario_attempts for select
  using (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

drop policy if exists "Users can insert own expert scenario attempts" on public.expert_scenario_attempts;
create policy "Users can insert own expert scenario attempts"
  on public.expert_scenario_attempts for insert
  with check (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

-- expert_interview_sessions

drop policy if exists "Users can view own expert interview sessions" on public.expert_interview_sessions;
create policy "Users can view own expert interview sessions"
  on public.expert_interview_sessions for select
  using (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

drop policy if exists "Users can insert own expert interview sessions" on public.expert_interview_sessions;
create policy "Users can insert own expert interview sessions"
  on public.expert_interview_sessions for insert
  with check (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

drop policy if exists "Users can update own expert interview sessions" on public.expert_interview_sessions;
create policy "Users can update own expert interview sessions"
  on public.expert_interview_sessions for update
  using (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  )
  with check (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

-- expert_activity

drop policy if exists "Users can view own expert activity" on public.expert_activity;
create policy "Users can view own expert activity"
  on public.expert_activity for select
  using (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );

drop policy if exists "Users can insert own expert activity" on public.expert_activity;
create policy "Users can insert own expert activity"
  on public.expert_activity for insert
  with check (
    auth.uid() = user_id
    and public.user_expert_accessible(user_expert_id)
  );
