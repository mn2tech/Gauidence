-- Generic organization knowledge facts (website / manual / future sources).
-- Public reads only published+public. Admin writes via service role after isPlatformAdmin().
-- Depends on 0095_public_event_knowledge.sql (knowledge_events).

-- Website scans may extract events before a firm start time is known.
alter table public.knowledge_events
  alter column start_at drop not null;

create table if not exists public.knowledge_facts (
  id uuid primary key default gen_random_uuid(),
  organization_slug text not null,
  category text not null default 'general',
  title text not null,
  content text not null,
  source_label text,
  source_url text,
  lifecycle_status text not null default 'draft'
    check (lifecycle_status in ('draft', 'needs_review', 'approved', 'published', 'archived')),
  visibility text not null default 'private'
    check (visibility in ('private', 'members', 'public')),
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_facts_org_status_idx
  on public.knowledge_facts (organization_slug, lifecycle_status, visibility);

create index if not exists knowledge_facts_org_title_idx
  on public.knowledge_facts (organization_slug, title);

create or replace function public.set_knowledge_facts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_facts_set_updated_at on public.knowledge_facts;
create trigger knowledge_facts_set_updated_at
  before update on public.knowledge_facts
  for each row
  execute function public.set_knowledge_facts_updated_at();

alter table public.knowledge_facts enable row level security;

drop policy if exists "knowledge_facts_public_select_published" on public.knowledge_facts;
create policy "knowledge_facts_public_select_published"
  on public.knowledge_facts
  for select
  to anon, authenticated
  using (lifecycle_status = 'published' and visibility = 'public');

-- No insert/update/delete policies for anon/authenticated — admin uses service role.
