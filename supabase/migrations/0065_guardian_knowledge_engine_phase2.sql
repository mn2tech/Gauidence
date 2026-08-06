-- Guardian Knowledge Engine Phase 2
-- Structured facts, extraction jobs, entity aliases, shared-vault RLS
--
-- Rollback (manual):
--   drop table if exists public.guardian_knowledge_extraction_jobs;
--   drop table if exists public.guardian_knowledge_entity_merge_suggestions;
--   drop table if exists public.guardian_knowledge_entity_aliases;
--   drop table if exists public.guardian_knowledge_facts;
--   drop type if exists public.knowledge_extraction_status;
--   drop type if exists public.knowledge_review_status;
--   -- restore 0056 RLS policies manually if needed

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'knowledge_review_status') then
    create type public.knowledge_review_status as enum (
      'confirmed',
      'suggested',
      'rejected',
      'superseded'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'knowledge_extraction_status') then
    create type public.knowledge_extraction_status as enum (
      'pending',
      'processing',
      'completed',
      'failed',
      'retryable',
      'stale'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Base knowledge graph tables (from 0056 — safe if already applied)
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_knowledge_entities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  entity_type text not null,
  name text not null,
  normalized_name text not null,
  source_type text not null,
  source_id text not null,
  confidence real,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guardian_knowledge_entities_dedup_idx
  on public.guardian_knowledge_entities (
    owner_user_id,
    profile_id,
    entity_type,
    normalized_name
  );

create index if not exists guardian_knowledge_entities_profile_idx
  on public.guardian_knowledge_entities (profile_id, updated_at desc);

create table if not exists public.guardian_knowledge_relationships (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  subject text not null,
  relationship text not null,
  object text not null,
  normalized_key text not null,
  source_type text not null,
  source_id text not null,
  confidence real,
  created_at timestamptz not null default now()
);

create unique index if not exists guardian_knowledge_relationships_dedup_idx
  on public.guardian_knowledge_relationships (
    owner_user_id,
    profile_id,
    normalized_key
  );

create table if not exists public.guardian_workspace_timeline (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  title text not null,
  event_date date,
  category text,
  source_type text not null,
  source_id text not null,
  normalized_key text not null,
  confidence real,
  created_at timestamptz not null default now()
);

create unique index if not exists guardian_workspace_timeline_dedup_idx
  on public.guardian_workspace_timeline (
    owner_user_id,
    profile_id,
    normalized_key
  );

create index if not exists guardian_workspace_timeline_profile_date_idx
  on public.guardian_workspace_timeline (profile_id, event_date desc nulls last, created_at desc);

create table if not exists public.guardian_proactive_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid references public.guardian_profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  priority smallint not null default 50,
  status text not null default 'pending'
    check (status in ('pending', 'dismissed', 'done')),
  due_date date,
  source_type text,
  source_id text,
  normalized_key text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guardian_proactive_suggestions_dedup_idx
  on public.guardian_proactive_suggestions (owner_user_id, normalized_key);

create index if not exists guardian_proactive_suggestions_owner_status_idx
  on public.guardian_proactive_suggestions (
    owner_user_id,
    status,
    priority desc,
    created_at desc
  );

alter table public.guardian_knowledge_entities enable row level security;
alter table public.guardian_knowledge_relationships enable row level security;
alter table public.guardian_workspace_timeline enable row level security;
alter table public.guardian_proactive_suggestions enable row level security;

-- ---------------------------------------------------------------------------
-- Extend existing entity table
-- ---------------------------------------------------------------------------
alter table public.guardian_knowledge_entities
  add column if not exists canonical_entity_id uuid
    references public.guardian_knowledge_entities (id) on delete set null,
  add column if not exists review_status public.knowledge_review_status
    not null default 'suggested',
  add column if not exists aliases jsonb default '[]'::jsonb,
  add column if not exists source_document_id uuid
    references public.documents (id) on delete set null,
  add column if not exists source_chunk_id uuid
    references public.document_chunks (id) on delete set null,
  add column if not exists source_excerpt text,
  add column if not exists last_confirmed_at timestamptz;

create index if not exists guardian_knowledge_entities_canonical_idx
  on public.guardian_knowledge_entities (canonical_entity_id)
  where canonical_entity_id is not null;

create index if not exists guardian_knowledge_entities_review_idx
  on public.guardian_knowledge_entities (profile_id, review_status);

-- ---------------------------------------------------------------------------
-- Structured facts (subject-predicate-object with provenance)
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_knowledge_facts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  subject_entity_id uuid references public.guardian_knowledge_entities (id) on delete set null,
  subject_name text not null,
  predicate text not null,
  object_entity_id uuid references public.guardian_knowledge_entities (id) on delete set null,
  object_value text,
  value_type text,
  normalized_value text,
  unit text,
  effective_date date,
  expiration_date date,
  confidence real not null default 0.5,
  review_status public.knowledge_review_status not null default 'suggested',
  source_type text not null,
  source_id text not null,
  source_document_id uuid references public.documents (id) on delete set null,
  source_chunk_id uuid references public.document_chunks (id) on delete set null,
  source_excerpt text,
  extraction_version text not null default 'v2',
  superseded_by_id uuid references public.guardian_knowledge_facts (id) on delete set null,
  superseded_at timestamptz,
  last_confirmed_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guardian_knowledge_facts_profile_idx
  on public.guardian_knowledge_facts (profile_id, review_status, updated_at desc);

create index if not exists guardian_knowledge_facts_subject_idx
  on public.guardian_knowledge_facts (profile_id, subject_name, predicate);

create index if not exists guardian_knowledge_facts_source_doc_idx
  on public.guardian_knowledge_facts (source_document_id)
  where source_document_id is not null;

create index if not exists guardian_knowledge_facts_effective_idx
  on public.guardian_knowledge_facts (profile_id, predicate, effective_date desc nulls last)
  where review_status in ('confirmed', 'suggested');

-- ---------------------------------------------------------------------------
-- Entity aliases
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_knowledge_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.guardian_knowledge_entities (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  confidence real,
  source_document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint guardian_knowledge_entity_aliases_unique
    unique (profile_id, normalized_alias)
);

create index if not exists guardian_knowledge_entity_aliases_entity_idx
  on public.guardian_knowledge_entity_aliases (entity_id);

-- ---------------------------------------------------------------------------
-- Merge suggestions (manual review required)
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_knowledge_entity_merge_suggestions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  source_entity_id uuid not null references public.guardian_knowledge_entities (id) on delete cascade,
  target_entity_id uuid not null references public.guardian_knowledge_entities (id) on delete cascade,
  confidence real not null,
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint guardian_knowledge_merge_suggestions_unique
    unique (source_entity_id, target_entity_id)
);

-- ---------------------------------------------------------------------------
-- Async knowledge extraction jobs
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_knowledge_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.knowledge_extraction_status not null default 'pending',
  extraction_version text not null default 'v2',
  attempts int not null default 0,
  last_error text,
  next_retry_at timestamptz,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_knowledge_extraction_jobs_doc_version_key
    unique (document_id, extraction_version)
);

create index if not exists guardian_knowledge_extraction_jobs_status_idx
  on public.guardian_knowledge_extraction_jobs (status, next_retry_at nulls first, created_at);

-- ---------------------------------------------------------------------------
-- Source visibility helper — facts must not leak hidden documents
-- ---------------------------------------------------------------------------
create or replace function public.can_view_knowledge_source(
  p_source_document_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    p_source_document_id is null
    or exists (
      select 1
      from public.documents d
      where d.id = p_source_document_id
        and d.profile_id = p_profile_id
        and public.can_view_vault_document_row(d.profile_id, d.client_visible)
    );
$$;

grant execute on function public.can_view_knowledge_source(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: replace owner-only policies with vault membership + source visibility
-- ---------------------------------------------------------------------------
alter table public.guardian_knowledge_entities enable row level security;
alter table public.guardian_knowledge_relationships enable row level security;
alter table public.guardian_workspace_timeline enable row level security;
alter table public.guardian_proactive_suggestions enable row level security;
alter table public.guardian_knowledge_facts enable row level security;
alter table public.guardian_knowledge_entity_aliases enable row level security;
alter table public.guardian_knowledge_entity_merge_suggestions enable row level security;
alter table public.guardian_knowledge_extraction_jobs enable row level security;

-- Entities
drop policy if exists "Users can view own knowledge entities" on public.guardian_knowledge_entities;
drop policy if exists "Users can insert own knowledge entities" on public.guardian_knowledge_entities;
drop policy if exists "Users can update own knowledge entities" on public.guardian_knowledge_entities;

drop policy if exists "Members can view knowledge entities" on public.guardian_knowledge_entities;
drop policy if exists "Editors can insert knowledge entities" on public.guardian_knowledge_entities;
drop policy if exists "Editors can update knowledge entities" on public.guardian_knowledge_entities;

create policy "Members can view knowledge entities"
  on public.guardian_knowledge_entities for select
  using (
    public.can_access_guardian_profile(profile_id)
    and public.can_view_knowledge_source(source_document_id, profile_id)
  );

create policy "Editors can insert knowledge entities"
  on public.guardian_knowledge_entities for insert
  with check (
    auth.uid() = owner_user_id
    and public.can_edit_guardian_profile(profile_id)
  );

create policy "Editors can update knowledge entities"
  on public.guardian_knowledge_entities for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

-- Relationships
drop policy if exists "Users can view own knowledge relationships" on public.guardian_knowledge_relationships;
drop policy if exists "Users can insert own knowledge relationships" on public.guardian_knowledge_relationships;

drop policy if exists "Members can view knowledge relationships" on public.guardian_knowledge_relationships;
drop policy if exists "Editors can insert knowledge relationships" on public.guardian_knowledge_relationships;
drop policy if exists "Editors can update knowledge relationships" on public.guardian_knowledge_relationships;

create policy "Members can view knowledge relationships"
  on public.guardian_knowledge_relationships for select
  using (public.can_access_guardian_profile(profile_id));

create policy "Editors can insert knowledge relationships"
  on public.guardian_knowledge_relationships for insert
  with check (
    auth.uid() = owner_user_id
    and public.can_edit_guardian_profile(profile_id)
  );

create policy "Editors can update knowledge relationships"
  on public.guardian_knowledge_relationships for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

-- Timeline
drop policy if exists "Users can view own workspace timeline" on public.guardian_workspace_timeline;
drop policy if exists "Users can insert own workspace timeline" on public.guardian_workspace_timeline;

drop policy if exists "Members can view workspace timeline" on public.guardian_workspace_timeline;
drop policy if exists "Editors can insert workspace timeline" on public.guardian_workspace_timeline;

create policy "Members can view workspace timeline"
  on public.guardian_workspace_timeline for select
  using (public.can_access_guardian_profile(profile_id));

create policy "Editors can insert workspace timeline"
  on public.guardian_workspace_timeline for insert
  with check (
    auth.uid() = owner_user_id
    and public.can_edit_guardian_profile(profile_id)
  );

-- Proactive suggestions
drop policy if exists "Users can view own proactive suggestions" on public.guardian_proactive_suggestions;
drop policy if exists "Users can insert own proactive suggestions" on public.guardian_proactive_suggestions;
drop policy if exists "Users can update own proactive suggestions" on public.guardian_proactive_suggestions;

drop policy if exists "Members can view proactive suggestions" on public.guardian_proactive_suggestions;
drop policy if exists "Editors can insert proactive suggestions" on public.guardian_proactive_suggestions;
drop policy if exists "Editors can update proactive suggestions" on public.guardian_proactive_suggestions;

create policy "Members can view proactive suggestions"
  on public.guardian_proactive_suggestions for select
  using (
    profile_id is null
    or public.can_access_guardian_profile(profile_id)
  );

create policy "Editors can insert proactive suggestions"
  on public.guardian_proactive_suggestions for insert
  with check (
    auth.uid() = owner_user_id
    and (profile_id is null or public.can_edit_guardian_profile(profile_id))
  );

create policy "Editors can update proactive suggestions"
  on public.guardian_proactive_suggestions for update
  using (
    profile_id is null
    or public.can_edit_guardian_profile(profile_id)
  );

-- Facts policies
drop policy if exists "Members can view knowledge facts" on public.guardian_knowledge_facts;
drop policy if exists "Editors can insert knowledge facts" on public.guardian_knowledge_facts;
drop policy if exists "Editors can update knowledge facts" on public.guardian_knowledge_facts;

create policy "Members can view knowledge facts"
  on public.guardian_knowledge_facts for select
  using (
    public.can_access_guardian_profile(profile_id)
    and public.can_view_knowledge_source(source_document_id, profile_id)
  );

create policy "Editors can insert knowledge facts"
  on public.guardian_knowledge_facts for insert
  with check (
    auth.uid() = owner_user_id
    and public.can_edit_guardian_profile(profile_id)
    and public.can_view_knowledge_source(source_document_id, profile_id)
  );

create policy "Editors can update knowledge facts"
  on public.guardian_knowledge_facts for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

-- Aliases policies
drop policy if exists "Members can view entity aliases" on public.guardian_knowledge_entity_aliases;
drop policy if exists "Editors can manage entity aliases" on public.guardian_knowledge_entity_aliases;

create policy "Members can view entity aliases"
  on public.guardian_knowledge_entity_aliases for select
  using (public.can_access_guardian_profile(profile_id));

create policy "Editors can manage entity aliases"
  on public.guardian_knowledge_entity_aliases for all
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

-- Merge suggestions policies
drop policy if exists "Members can view merge suggestions" on public.guardian_knowledge_entity_merge_suggestions;
drop policy if exists "Editors can manage merge suggestions" on public.guardian_knowledge_entity_merge_suggestions;

create policy "Members can view merge suggestions"
  on public.guardian_knowledge_entity_merge_suggestions for select
  using (public.can_access_guardian_profile(profile_id));

create policy "Editors can manage merge suggestions"
  on public.guardian_knowledge_entity_merge_suggestions for all
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

-- Extraction jobs policies
drop policy if exists "Users manage own knowledge extraction jobs" on public.guardian_knowledge_extraction_jobs;

create policy "Users manage own knowledge extraction jobs"
  on public.guardian_knowledge_extraction_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
