-- Guardian Ontology Engine Phase 1
-- Space-scoped entity/relationship/evidence layer alongside existing Guardian data.
-- Rollback:
--   drop table if exists public.ontology_evidence;
--   drop table if exists public.ontology_events;
--   drop table if exists public.ontology_relationships;
--   drop table if exists public.ontology_entity_aliases;
--   drop table if exists public.ontology_entities;
--   alter table public.documents drop column if exists ontology_status;

-- ---------------------------------------------------------------------------
-- ontology_entities
-- ---------------------------------------------------------------------------
create table if not exists public.ontology_entities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  entity_type text not null,
  name text not null,
  canonical_name text,
  description text,
  properties jsonb not null default '{}'::jsonb,
  confidence numeric,
  source_type text,
  source_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ontology_entities_profile_type_idx
  on public.ontology_entities (profile_id, entity_type);

create index if not exists ontology_entities_profile_canonical_idx
  on public.ontology_entities (profile_id, lower(canonical_name))
  where canonical_name is not null;

create index if not exists ontology_entities_source_idx
  on public.ontology_entities (profile_id, source_type, source_id)
  where source_id is not null;

create index if not exists ontology_entities_name_trgm_idx
  on public.ontology_entities using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- ontology_entity_aliases
-- ---------------------------------------------------------------------------
create table if not exists public.ontology_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  entity_id uuid not null references public.ontology_entities (id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  constraint ontology_entity_aliases_unique
    unique (profile_id, normalized_alias)
);

create index if not exists ontology_entity_aliases_entity_idx
  on public.ontology_entity_aliases (entity_id);

create index if not exists ontology_entity_aliases_normalized_idx
  on public.ontology_entity_aliases (profile_id, normalized_alias);

-- ---------------------------------------------------------------------------
-- ontology_relationships
-- ---------------------------------------------------------------------------
create table if not exists public.ontology_relationships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  source_entity_id uuid not null references public.ontology_entities (id) on delete cascade,
  relationship_type text not null,
  target_entity_id uuid not null references public.ontology_entities (id) on delete cascade,
  properties jsonb not null default '{}'::jsonb,
  confidence numeric,
  source_document_id uuid references public.documents (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ontology_relationships_no_self_loop
    check (source_entity_id <> target_entity_id),
  constraint ontology_relationships_unique
    unique (profile_id, source_entity_id, relationship_type, target_entity_id)
);

create index if not exists ontology_relationships_source_idx
  on public.ontology_relationships (source_entity_id);

create index if not exists ontology_relationships_target_idx
  on public.ontology_relationships (target_entity_id);

create index if not exists ontology_relationships_profile_type_idx
  on public.ontology_relationships (profile_id, relationship_type);

-- ---------------------------------------------------------------------------
-- ontology_evidence
-- ---------------------------------------------------------------------------
create table if not exists public.ontology_evidence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  entity_id uuid references public.ontology_entities (id) on delete cascade,
  relationship_id uuid references public.ontology_relationships (id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  document_id uuid references public.documents (id) on delete set null,
  chunk_id uuid references public.document_chunks (id) on delete set null,
  evidence_text text,
  page_number integer,
  confidence numeric,
  created_at timestamptz not null default now(),
  constraint ontology_evidence_target_required
    check (entity_id is not null or relationship_id is not null)
);

create index if not exists ontology_evidence_entity_idx
  on public.ontology_evidence (entity_id)
  where entity_id is not null;

create index if not exists ontology_evidence_relationship_idx
  on public.ontology_evidence (relationship_id)
  where relationship_id is not null;

create index if not exists ontology_evidence_document_idx
  on public.ontology_evidence (document_id)
  where document_id is not null;

create index if not exists ontology_evidence_source_idx
  on public.ontology_evidence (profile_id, source_type, source_id);

-- ---------------------------------------------------------------------------
-- ontology_events (schema only — light Phase 1 integration)
-- ---------------------------------------------------------------------------
create table if not exists public.ontology_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  event_type text not null,
  title text not null,
  event_date timestamptz,
  properties jsonb not null default '{}'::jsonb,
  source_document_id uuid references public.documents (id) on delete set null,
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ontology_events_profile_type_idx
  on public.ontology_events (profile_id, event_type);

-- ---------------------------------------------------------------------------
-- Document ontology processing status
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists ontology_status text not null default 'pending';

comment on column public.documents.ontology_status is
  'Ontology extraction: pending | processing | completed | failed | retryable | skipped';

-- ---------------------------------------------------------------------------
-- Pipeline job type: extract_ontology
-- ---------------------------------------------------------------------------
do $$ begin
  alter type public.document_processing_job_type add value 'extract_ontology';
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ontology_entities enable row level security;
alter table public.ontology_entity_aliases enable row level security;
alter table public.ontology_relationships enable row level security;
alter table public.ontology_evidence enable row level security;
alter table public.ontology_events enable row level security;

-- ontology_entities
drop policy if exists "Members can view ontology entities" on public.ontology_entities;
create policy "Members can view ontology entities"
  on public.ontology_entities for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Editors can create ontology entities" on public.ontology_entities;
create policy "Editors can create ontology entities"
  on public.ontology_entities for insert
  with check (
    public.can_edit_guardian_profile(profile_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "Editors can update ontology entities" on public.ontology_entities;
create policy "Editors can update ontology entities"
  on public.ontology_entities for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

drop policy if exists "Owners can delete ontology entities" on public.ontology_entities;
create policy "Owners can delete ontology entities"
  on public.ontology_entities for delete
  using (public.can_manage_guardian_profile(profile_id));

-- ontology_entity_aliases
drop policy if exists "Members can view ontology aliases" on public.ontology_entity_aliases;
create policy "Members can view ontology aliases"
  on public.ontology_entity_aliases for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Editors can manage ontology aliases" on public.ontology_entity_aliases;
create policy "Editors can manage ontology aliases"
  on public.ontology_entity_aliases for all
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

-- ontology_relationships
drop policy if exists "Members can view ontology relationships" on public.ontology_relationships;
create policy "Members can view ontology relationships"
  on public.ontology_relationships for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Editors can create ontology relationships" on public.ontology_relationships;
create policy "Editors can create ontology relationships"
  on public.ontology_relationships for insert
  with check (
    public.can_edit_guardian_profile(profile_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "Editors can update ontology relationships" on public.ontology_relationships;
create policy "Editors can update ontology relationships"
  on public.ontology_relationships for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

drop policy if exists "Owners can delete ontology relationships" on public.ontology_relationships;
create policy "Owners can delete ontology relationships"
  on public.ontology_relationships for delete
  using (public.can_manage_guardian_profile(profile_id));

-- ontology_evidence
drop policy if exists "Members can view ontology evidence" on public.ontology_evidence;
create policy "Members can view ontology evidence"
  on public.ontology_evidence for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Editors can manage ontology evidence" on public.ontology_evidence;
create policy "Editors can manage ontology evidence"
  on public.ontology_evidence for all
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

-- ontology_events
drop policy if exists "Members can view ontology events" on public.ontology_events;
create policy "Members can view ontology events"
  on public.ontology_events for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Editors can manage ontology events" on public.ontology_events;
create policy "Editors can manage ontology events"
  on public.ontology_events for all
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.ontology_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ontology_entities_updated_at on public.ontology_entities;
create trigger ontology_entities_updated_at
  before update on public.ontology_entities
  for each row execute function public.ontology_set_updated_at();

drop trigger if exists ontology_relationships_updated_at on public.ontology_relationships;
create trigger ontology_relationships_updated_at
  before update on public.ontology_relationships
  for each row execute function public.ontology_set_updated_at();

drop trigger if exists ontology_events_updated_at on public.ontology_events;
create trigger ontology_events_updated_at
  before update on public.ontology_events
  for each row execute function public.ontology_set_updated_at();
