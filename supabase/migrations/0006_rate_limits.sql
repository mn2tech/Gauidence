-- Per-user AI analysis rate limiting.
-- Each Analyze request inserts a row; the API counts events in the last hour.
-- Run in the Supabase SQL Editor.

create table if not exists public.analysis_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists analysis_events_user_created_idx
  on public.analysis_events (user_id, created_at desc);

alter table public.analysis_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'analysis_events'
      and policyname = 'Users can view own analysis events'
  ) then
    create policy "Users can view own analysis events"
      on public.analysis_events for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'analysis_events'
      and policyname = 'Users can insert own analysis events'
  ) then
    create policy "Users can insert own analysis events"
      on public.analysis_events for insert
      with check (auth.uid() = user_id);
  end if;
end $$;
