-- Guardian Leads: company research, provenance, and ontology-ready graph.
-- Structured research stays on the lead until the user saves; history is append-only.
-- Rollback:
--   drop table if exists public.lead_graph_relationships;
--   drop table if exists public.lead_research_facts;
--   drop table if exists public.lead_graph_entities;
--   drop table if exists public.lead_research_runs;
--   alter table public.business_leads drop column if exists legal_company_name;
--   alter table public.business_leads drop column if exists company_description;
--   alter table public.business_leads drop column if exists headquarters;
--   alter table public.business_leads drop column if exists primary_naics;
--   alter table public.business_leads drop column if exists last_researched_at;
--   alter table public.business_leads drop column if exists partner_fit;
--   alter table public.business_leads drop column if exists research_summary;
--   alter table public.business_leads drop column if exists recommended_outreach_angle;
--   alter table public.business_leads drop column if exists why_company_matters;
--   alter table public.business_leads drop column if exists nm2tech_can_bring;
--   alter table public.business_leads drop column if exists federal_profile_data;
--   alter table public.lead_activities drop constraint if exists lead_activities_activity_type_check;

-- ---------------------------------------------------------------------------
-- business_leads: identity, partner-fit, denormalized research snapshot
-- ---------------------------------------------------------------------------
alter table public.business_leads
  add column if not exists legal_company_name text,
  add column if not exists company_description text,
  add column if not exists headquarters text,
  add column if not exists primary_naics text,
  add column if not exists last_researched_at timestamptz,
  add column if not exists partner_fit jsonb,
  add column if not exists research_summary jsonb,
  add column if not exists recommended_outreach_angle text,
  add column if not exists why_company_matters text,
  add column if not exists nm2tech_can_bring text,
  add column if not exists federal_profile_data jsonb not null default '{}'::jsonb;

create index if not exists business_leads_uei_idx
  on public.business_leads (business_profile_id, lower(uei))
  where uei is not null and char_length(trim(uei)) > 0;

create index if not exists business_leads_last_researched_idx
  on public.business_leads (business_profile_id, last_researched_at desc)
  where last_researched_at is not null;

-- ---------------------------------------------------------------------------
-- lead_research_runs: one row per research or refresh
-- ---------------------------------------------------------------------------
create table if not exists public.lead_research_runs (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  lead_id uuid references public.business_leads (id) on delete cascade,
  mode text not null default 'full'
    check (mode in ('full', 'refresh')),
  query_company_name text,
  query_website text,
  status text not null default 'complete'
    check (status in ('complete', 'needs_disambiguation', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  partner_fit jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_research_runs_lead_idx
  on public.lead_research_runs (lead_id, created_at desc)
  where lead_id is not null;

create index if not exists lead_research_runs_business_idx
  on public.lead_research_runs (business_profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- lead_research_facts: provenance for each researched field (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_research_facts (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.lead_research_runs (id) on delete cascade,
  lead_id uuid not null references public.business_leads (id) on delete cascade,
  field_key text not null,
  value_json jsonb not null default 'null'::jsonb,
  confidence text not null
    check (confidence in ('verified', 'high', 'medium', 'low', 'not_found')),
  source text,
  source_type text,
  source_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lead_research_facts_lead_idx
  on public.lead_research_facts (lead_id, field_key, created_at desc);

create index if not exists lead_research_facts_run_idx
  on public.lead_research_facts (research_run_id);

-- ---------------------------------------------------------------------------
-- lead_graph_entities: first-class nodes for later ontology promotion
-- Company/Person/Agency/Bureau/Capability/Technology/NAICS/Vehicle/Contract/
-- Task Order/Opportunity/Relationship/Source
-- ---------------------------------------------------------------------------
create table if not exists public.lead_graph_entities (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  lead_id uuid references public.business_leads (id) on delete cascade,
  entity_type text not null
    check (entity_type in (
      'company',
      'person',
      'agency',
      'bureau',
      'capability',
      'technology',
      'naics',
      'contract_vehicle',
      'contract',
      'task_order',
      'opportunity',
      'relationship',
      'source'
    )),
  name text not null,
  canonical_name text,
  properties jsonb not null default '{}'::jsonb,
  parent_id uuid references public.lead_graph_entities (id) on delete set null,
  last_research_run_id uuid references public.lead_research_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_graph_entities_name_required check (char_length(trim(name)) > 0)
);

create index if not exists lead_graph_entities_lead_type_idx
  on public.lead_graph_entities (lead_id, entity_type)
  where lead_id is not null;

create index if not exists lead_graph_entities_business_type_idx
  on public.lead_graph_entities (business_profile_id, entity_type, lower(canonical_name));

create unique index if not exists lead_graph_entities_lead_canonical_uidx
  on public.lead_graph_entities (
    lead_id,
    entity_type,
    lower(coalesce(canonical_name, name))
  )
  where lead_id is not null;

-- ---------------------------------------------------------------------------
-- lead_graph_relationships: Company SERVES Agency, HOLDS vehicle, WON contract, …
-- ---------------------------------------------------------------------------
create table if not exists public.lead_graph_relationships (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  lead_id uuid references public.business_leads (id) on delete cascade,
  source_entity_id uuid not null references public.lead_graph_entities (id) on delete cascade,
  relationship_type text not null,
  target_entity_id uuid not null references public.lead_graph_entities (id) on delete cascade,
  properties jsonb not null default '{}'::jsonb,
  research_run_id uuid references public.lead_research_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_graph_relationships_no_self_loop
    check (source_entity_id <> target_entity_id)
);

create unique index if not exists lead_graph_relationships_unique
  on public.lead_graph_relationships (
    lead_id,
    source_entity_id,
    relationship_type,
    target_entity_id
  )
  where lead_id is not null;

create index if not exists lead_graph_relationships_source_idx
  on public.lead_graph_relationships (source_entity_id);

create index if not exists lead_graph_relationships_target_idx
  on public.lead_graph_relationships (target_entity_id);

-- ---------------------------------------------------------------------------
-- lead_activities: research_refreshed
-- ---------------------------------------------------------------------------
alter table public.lead_activities drop constraint if exists lead_activities_activity_type_check;
alter table public.lead_activities
  add constraint lead_activities_activity_type_check
  check (activity_type in (
    'created',
    'researched',
    'research_refreshed',
    'note',
    'outreach_drafted',
    'contacted',
    'follow_up',
    'status_changed',
    'proposal_created',
    'email_sent',
    'email_received',
    'phone_call',
    'meeting',
    'networking_event',
    'linkedin',
    'capability_statement',
    'proposal_sent',
    'teaming_discussion',
    'opportunity_discussion'
  ));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lead_research_runs enable row level security;
alter table public.lead_research_facts enable row level security;
alter table public.lead_graph_entities enable row level security;
alter table public.lead_graph_relationships enable row level security;

drop policy if exists "Members can view lead research runs" on public.lead_research_runs;
create policy "Members can view lead research runs"
  on public.lead_research_runs for select
  using (public.can_access_guardian_profile(business_profile_id));

drop policy if exists "Editors can insert lead research runs" on public.lead_research_runs;
create policy "Editors can insert lead research runs"
  on public.lead_research_runs for insert
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Members can view lead research facts" on public.lead_research_facts;
create policy "Members can view lead research facts"
  on public.lead_research_facts for select
  using (
    exists (
      select 1 from public.business_leads l
      where l.id = lead_id
        and public.can_access_guardian_profile(l.business_profile_id)
    )
  );

drop policy if exists "Editors can insert lead research facts" on public.lead_research_facts;
create policy "Editors can insert lead research facts"
  on public.lead_research_facts for insert
  with check (
    exists (
      select 1 from public.business_leads l
      where l.id = lead_id
        and public.can_edit_guardian_profile(l.business_profile_id)
    )
  );

drop policy if exists "Members can view lead graph entities" on public.lead_graph_entities;
create policy "Members can view lead graph entities"
  on public.lead_graph_entities for select
  using (public.can_access_guardian_profile(business_profile_id));

drop policy if exists "Editors can insert lead graph entities" on public.lead_graph_entities;
create policy "Editors can insert lead graph entities"
  on public.lead_graph_entities for insert
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Editors can update lead graph entities" on public.lead_graph_entities;
create policy "Editors can update lead graph entities"
  on public.lead_graph_entities for update
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Members can view lead graph relationships" on public.lead_graph_relationships;
create policy "Members can view lead graph relationships"
  on public.lead_graph_relationships for select
  using (public.can_access_guardian_profile(business_profile_id));

drop policy if exists "Editors can insert lead graph relationships" on public.lead_graph_relationships;
create policy "Editors can insert lead graph relationships"
  on public.lead_graph_relationships for insert
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Editors can update lead graph relationships" on public.lead_graph_relationships;
create policy "Editors can update lead graph relationships"
  on public.lead_graph_relationships for update
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

create or replace function public.lead_graph_entities_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lead_graph_entities_updated_at on public.lead_graph_entities;
create trigger lead_graph_entities_updated_at
  before update on public.lead_graph_entities
  for each row execute function public.lead_graph_entities_set_updated_at();
