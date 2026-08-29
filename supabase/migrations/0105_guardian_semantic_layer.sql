-- Guardian Semantic Layer Phase 1
-- User-scoped canonical entities, relationships, facts, and evidence.
-- Sits between content extraction and guardian_items in the pipeline.
-- Rollback:
--   drop table if exists public.semantic_evidence_links;
--   drop table if exists public.semantic_evidence;
--   drop table if exists public.semantic_facts;
--   drop table if exists public.semantic_relationships;
--   drop table if exists public.semantic_entities;
--   alter table public.documents drop column if exists semantic_status;
--   alter table public.guardian_items drop column if exists metadata;
--   -- enum value extract_semantic cannot be removed safely once added

-- ---------------------------------------------------------------------------
-- semantic_entities
-- ---------------------------------------------------------------------------
create table if not exists public.semantic_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  canonical_name text not null,
  entity_type text not null,
  normalized_name text,
  description text,
  aliases jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  confidence numeric,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists semantic_entities_user_id_idx
  on public.semantic_entities (user_id);

create index if not exists semantic_entities_entity_type_idx
  on public.semantic_entities (entity_type);

create index if not exists semantic_entities_normalized_name_idx
  on public.semantic_entities (normalized_name);

create index if not exists semantic_entities_user_normalized_idx
  on public.semantic_entities (user_id, normalized_name);

create index if not exists semantic_entities_user_type_idx
  on public.semantic_entities (user_id, entity_type);

-- ---------------------------------------------------------------------------
-- semantic_relationships
-- ---------------------------------------------------------------------------
create table if not exists public.semantic_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_entity_id uuid not null references public.semantic_entities (id) on delete cascade,
  relationship_type text not null,
  target_entity_id uuid not null references public.semantic_entities (id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  confidence numeric,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint semantic_relationships_no_self_loop
    check (source_entity_id <> target_entity_id)
);

create unique index if not exists semantic_relationships_identity_idx
  on public.semantic_relationships (
    user_id, source_entity_id, relationship_type, target_entity_id
  );

create index if not exists semantic_relationships_user_id_idx
  on public.semantic_relationships (user_id);

create index if not exists semantic_relationships_source_idx
  on public.semantic_relationships (source_entity_id);

create index if not exists semantic_relationships_target_idx
  on public.semantic_relationships (target_entity_id);

create index if not exists semantic_relationships_type_idx
  on public.semantic_relationships (user_id, relationship_type);

-- ---------------------------------------------------------------------------
-- semantic_facts
-- ---------------------------------------------------------------------------
create table if not exists public.semantic_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_entity_id uuid references public.semantic_entities (id) on delete cascade,
  predicate text not null,
  value_text text,
  value_number numeric,
  value_date timestamptz,
  value_json jsonb,
  confidence numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint semantic_facts_status_chk
    check (status in ('active', 'superseded', 'retracted'))
);

create index if not exists semantic_facts_user_id_idx
  on public.semantic_facts (user_id);

create index if not exists semantic_facts_subject_idx
  on public.semantic_facts (subject_entity_id)
  where subject_entity_id is not null;

create index if not exists semantic_facts_predicate_idx
  on public.semantic_facts (user_id, predicate);

create unique index if not exists semantic_facts_identity_idx
  on public.semantic_facts (
    user_id,
    coalesce(subject_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    predicate,
    coalesce(value_text, ''),
    coalesce(value_number, 0),
    coalesce(value_date, 'epoch'::timestamptz)
  )
  where status = 'active';

-- ---------------------------------------------------------------------------
-- semantic_evidence
-- ---------------------------------------------------------------------------
create table if not exists public.semantic_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null,
  source_id text not null,
  space_id uuid references public.guardian_profiles (id) on delete set null,
  source_title text,
  source_excerpt text,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint semantic_evidence_excerpt_len_chk
    check (source_excerpt is null or char_length(source_excerpt) <= 800)
);

create unique index if not exists semantic_evidence_source_identity_idx
  on public.semantic_evidence (user_id, source_type, source_id, coalesce(source_excerpt, ''));

create index if not exists semantic_evidence_user_id_idx
  on public.semantic_evidence (user_id);

create index if not exists semantic_evidence_source_idx
  on public.semantic_evidence (user_id, source_type, source_id);

create index if not exists semantic_evidence_space_idx
  on public.semantic_evidence (space_id)
  where space_id is not null;

-- ---------------------------------------------------------------------------
-- semantic_evidence_links
-- ---------------------------------------------------------------------------
create table if not exists public.semantic_evidence_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  evidence_id uuid not null references public.semantic_evidence (id) on delete cascade,
  semantic_object_type text not null,
  semantic_object_id uuid not null,
  created_at timestamptz not null default now(),
  constraint semantic_evidence_links_type_chk
    check (semantic_object_type in ('entity', 'relationship', 'fact'))
);

create unique index if not exists semantic_evidence_links_identity_idx
  on public.semantic_evidence_links (
    evidence_id, semantic_object_type, semantic_object_id
  );

create index if not exists semantic_evidence_links_object_idx
  on public.semantic_evidence_links (semantic_object_type, semantic_object_id);

create index if not exists semantic_evidence_links_user_id_idx
  on public.semantic_evidence_links (user_id);

-- ---------------------------------------------------------------------------
-- Document semantic processing status + pipeline job type
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists semantic_status text not null default 'pending';

comment on column public.documents.semantic_status is
  'Semantic Layer extraction: pending | processing | completed | failed | retryable | skipped';

do $$ begin
  alter type public.document_processing_job_type add value 'extract_semantic';
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- guardian_items: optional semantic context via extensible metadata
-- ---------------------------------------------------------------------------
alter table public.guardian_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.guardian_items.metadata is
  'Extensible metadata. Semantic refs: semantic_entity_ids, semantic_relationship_ids, semantic_fact_ids.';

-- ---------------------------------------------------------------------------
-- RLS — user-scoped isolation (semantic graph is per-user across Spaces)
-- ---------------------------------------------------------------------------
alter table public.semantic_entities enable row level security;
alter table public.semantic_relationships enable row level security;
alter table public.semantic_facts enable row level security;
alter table public.semantic_evidence enable row level security;
alter table public.semantic_evidence_links enable row level security;

-- semantic_entities
drop policy if exists "Users can view own semantic entities" on public.semantic_entities;
create policy "Users can view own semantic entities"
  on public.semantic_entities for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own semantic entities" on public.semantic_entities;
create policy "Users can create own semantic entities"
  on public.semantic_entities for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own semantic entities" on public.semantic_entities;
create policy "Users can update own semantic entities"
  on public.semantic_entities for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own semantic entities" on public.semantic_entities;
create policy "Users can delete own semantic entities"
  on public.semantic_entities for delete
  using (auth.uid() = user_id);

-- semantic_relationships
drop policy if exists "Users can view own semantic relationships" on public.semantic_relationships;
create policy "Users can view own semantic relationships"
  on public.semantic_relationships for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own semantic relationships" on public.semantic_relationships;
create policy "Users can create own semantic relationships"
  on public.semantic_relationships for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own semantic relationships" on public.semantic_relationships;
create policy "Users can update own semantic relationships"
  on public.semantic_relationships for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own semantic relationships" on public.semantic_relationships;
create policy "Users can delete own semantic relationships"
  on public.semantic_relationships for delete
  using (auth.uid() = user_id);

-- semantic_facts
drop policy if exists "Users can view own semantic facts" on public.semantic_facts;
create policy "Users can view own semantic facts"
  on public.semantic_facts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own semantic facts" on public.semantic_facts;
create policy "Users can create own semantic facts"
  on public.semantic_facts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own semantic facts" on public.semantic_facts;
create policy "Users can update own semantic facts"
  on public.semantic_facts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own semantic facts" on public.semantic_facts;
create policy "Users can delete own semantic facts"
  on public.semantic_facts for delete
  using (auth.uid() = user_id);

-- semantic_evidence
drop policy if exists "Users can view own semantic evidence" on public.semantic_evidence;
create policy "Users can view own semantic evidence"
  on public.semantic_evidence for select
  using (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_access_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can create own semantic evidence" on public.semantic_evidence;
create policy "Users can create own semantic evidence"
  on public.semantic_evidence for insert
  with check (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_edit_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can update own semantic evidence" on public.semantic_evidence;
create policy "Users can update own semantic evidence"
  on public.semantic_evidence for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_edit_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can delete own semantic evidence" on public.semantic_evidence;
create policy "Users can delete own semantic evidence"
  on public.semantic_evidence for delete
  using (auth.uid() = user_id);

-- semantic_evidence_links
drop policy if exists "Users can view own semantic evidence links" on public.semantic_evidence_links;
create policy "Users can view own semantic evidence links"
  on public.semantic_evidence_links for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own semantic evidence links" on public.semantic_evidence_links;
create policy "Users can create own semantic evidence links"
  on public.semantic_evidence_links for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own semantic evidence links" on public.semantic_evidence_links;
create policy "Users can delete own semantic evidence links"
  on public.semantic_evidence_links for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.semantic_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists semantic_entities_updated_at on public.semantic_entities;
create trigger semantic_entities_updated_at
  before update on public.semantic_entities
  for each row execute function public.semantic_set_updated_at();

drop trigger if exists semantic_relationships_updated_at on public.semantic_relationships;
create trigger semantic_relationships_updated_at
  before update on public.semantic_relationships
  for each row execute function public.semantic_set_updated_at();

drop trigger if exists semantic_facts_updated_at on public.semantic_facts;
create trigger semantic_facts_updated_at
  before update on public.semantic_facts
  for each row execute function public.semantic_set_updated_at();
