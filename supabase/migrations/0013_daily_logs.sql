-- Sprint 10 addition: profile-scoped Daily Logs.
-- Calendar dates use DATE (no timestamptz day-shift).
-- RLS: owner + owns_guardian_profile(profile_id).

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  log_date date not null,
  title text,
  content text not null,
  category text,
  tags text[] not null default '{}',
  source_type text not null default 'user_entered'
    check (source_type in ('user_entered', 'quick_log')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_logs_profile_date_idx
  on public.daily_logs (profile_id, log_date desc);

create index if not exists daily_logs_owner_idx
  on public.daily_logs (owner_user_id);

create index if not exists daily_logs_category_idx
  on public.daily_logs (profile_id, category);

alter table public.daily_logs enable row level security;

create policy "Owners can view own daily logs"
  on public.daily_logs for select
  using (
    auth.uid() = owner_user_id
    and public.owns_guardian_profile(profile_id)
  );

create policy "Owners can insert own daily logs"
  on public.daily_logs for insert
  with check (
    auth.uid() = owner_user_id
    and public.owns_guardian_profile(profile_id)
  );

create policy "Owners can update own daily logs"
  on public.daily_logs for update
  using (
    auth.uid() = owner_user_id
    and public.owns_guardian_profile(profile_id)
  )
  with check (
    auth.uid() = owner_user_id
    and public.owns_guardian_profile(profile_id)
  );

create policy "Owners can delete own daily logs"
  on public.daily_logs for delete
  using (
    auth.uid() = owner_user_id
    and public.owns_guardian_profile(profile_id)
  );
