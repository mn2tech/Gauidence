-- Phase 2: parent school context + reminders for personalized MCPS knowledge.
-- Public-info only: school name + grade. No student PII.

create table if not exists public.parent_school_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  school_name text not null,
  school_id text,
  grade_level text not null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parent_school_contexts_user_idx
  on public.parent_school_contexts (user_id, is_primary desc);

-- At most one primary context per user (Phase 2 starts with one school/grade).
create unique index if not exists parent_school_contexts_one_primary_idx
  on public.parent_school_contexts (user_id)
  where is_primary = true;

create table if not exists public.parent_knowledge_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  knowledge_item_id uuid references public.knowledge_items (id) on delete set null,
  title text not null,
  reminder_date date not null,
  event_date date,
  status text not null default 'active'
    check (status in ('active', 'completed', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists parent_knowledge_reminders_user_idx
  on public.parent_knowledge_reminders (user_id, status, reminder_date);

create or replace function public.set_parent_school_contexts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists parent_school_contexts_set_updated_at on public.parent_school_contexts;
create trigger parent_school_contexts_set_updated_at
  before update on public.parent_school_contexts
  for each row
  execute function public.set_parent_school_contexts_updated_at();

alter table public.parent_school_contexts enable row level security;
alter table public.parent_knowledge_reminders enable row level security;

drop policy if exists "parent_school_contexts_owner_all" on public.parent_school_contexts;
create policy "parent_school_contexts_owner_all"
  on public.parent_school_contexts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "parent_knowledge_reminders_owner_all" on public.parent_knowledge_reminders;
create policy "parent_knowledge_reminders_owner_all"
  on public.parent_knowledge_reminders
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.parent_school_contexts is
  'Parent-selected school + grade for MCPS personalization. No student PII.';
comment on table public.parent_knowledge_reminders is
  'Simple Remind Me reminders for dated published knowledge items.';
