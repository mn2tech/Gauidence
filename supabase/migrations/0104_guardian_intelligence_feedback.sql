-- Guardian Today v1: lightweight feedback signals for intelligence items.
-- Requires: 0103_guardian_items.sql (creates public.guardian_items)
-- Rollback: drop table if exists public.guardian_intelligence_feedback;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'guardian_items'
  ) then
    raise exception
      'Missing public.guardian_items. Run supabase/migrations/0103_guardian_items.sql first, then re-run this migration.';
  end if;
end $$;

create table if not exists public.guardian_intelligence_feedback (  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.guardian_items (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now(),

  constraint guardian_intelligence_feedback_action_chk check (
    action in (
      'completed',
      'dismissed',
      'snoozed',
      'opened',
      'asked_gideon',
      'reviewed'
    )
  )
);

create index if not exists guardian_intelligence_feedback_user_created_idx
  on public.guardian_intelligence_feedback (user_id, created_at desc);

create index if not exists guardian_intelligence_feedback_item_idx
  on public.guardian_intelligence_feedback (item_id, created_at desc);

alter table public.guardian_intelligence_feedback enable row level security;

drop policy if exists "Users can view own intelligence feedback" on public.guardian_intelligence_feedback;
create policy "Users can view own intelligence feedback"
  on public.guardian_intelligence_feedback for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own intelligence feedback" on public.guardian_intelligence_feedback;
create policy "Users can insert own intelligence feedback"
  on public.guardian_intelligence_feedback for insert
  with check (auth.uid() = user_id);
