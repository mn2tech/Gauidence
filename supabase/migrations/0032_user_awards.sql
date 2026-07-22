-- User awards (milestones, no points). One row per user per award_key.

create table if not exists public.user_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  award_key text not null,
  profile_id uuid references public.guardian_profiles (id) on delete set null,
  earned_at timestamptz not null default now(),
  unique (user_id, award_key)
);

create index if not exists user_awards_user_earned_idx
  on public.user_awards (user_id, earned_at desc);

alter table public.user_awards enable row level security;

create policy "Users can view own awards"
  on public.user_awards for select
  using (auth.uid() = user_id);

comment on table public.user_awards is
  'Earned user milestones (no points). Inserts via service role from API routes.';
