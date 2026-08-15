-- Guardian Pack Engine V1 + Guardian Business Pack #001 seed
-- Packs teach Guardian how to understand an organization (Space).
-- Tenancy: installs are scoped to guardian_profiles (business/nonprofit Spaces).
-- Rollback:
--   drop table if exists public.pack_install_events;
--   drop table if exists public.profile_pack_spaces;
--   drop table if exists public.profile_packs;
--   drop table if exists public.pack_dashboard_config;
--   drop table if exists public.pack_starter_questions;
--   drop table if exists public.pack_rules;
--   drop table if exists public.pack_gideon_skills;
--   drop table if exists public.pack_spaces;
--   drop table if exists public.pack_relationship_types;
--   drop table if exists public.pack_entity_types;
--   drop table if exists public.pack_versions;
--   drop table if exists public.packs;

-- ---------------------------------------------------------------------------
-- Catalog: packs + versions
-- ---------------------------------------------------------------------------
create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text not null default '',
  category text not null default 'industry',
  status text not null default 'available'
    check (status in ('available', 'deprecated', 'hidden')),
  pack_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packs_slug_unique unique (slug)
);

create table if not exists public.pack_versions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs (id) on delete cascade,
  version text not null,
  changelog text not null default '',
  status text not null default 'published'
    check (status in ('draft', 'published', 'retired')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pack_versions_unique unique (pack_id, version)
);

create index if not exists pack_versions_pack_idx
  on public.pack_versions (pack_id, status);

-- ---------------------------------------------------------------------------
-- Version definition tables
-- ---------------------------------------------------------------------------
create table if not exists public.pack_entity_types (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references public.pack_versions (id) on delete cascade,
  key text not null,
  label text not null,
  description text not null default '',
  sort_order integer not null default 0,
  constraint pack_entity_types_unique unique (pack_version_id, key)
);

create table if not exists public.pack_relationship_types (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references public.pack_versions (id) on delete cascade,
  key text not null,
  label text not null default '',
  description text not null default '',
  source_entity_type text not null,
  target_entity_type text not null,
  sort_order integer not null default 0,
  constraint pack_relationship_types_unique unique (pack_version_id, key)
);

create table if not exists public.pack_spaces (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references public.pack_versions (id) on delete cascade,
  key text not null,
  display_name text not null,
  description text not null default '',
  profile_type text not null default 'other',
  default_selected boolean not null default true,
  sort_order integer not null default 0,
  constraint pack_spaces_unique unique (pack_version_id, key)
);

create table if not exists public.pack_gideon_skills (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references public.pack_versions (id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  prompt_addon text not null default '',
  sort_order integer not null default 0,
  constraint pack_gideon_skills_unique unique (pack_version_id, key)
);

create table if not exists public.pack_rules (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references public.pack_versions (id) on delete cascade,
  key text not null,
  rule_type text not null default 'guidance',
  definition jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  constraint pack_rules_unique unique (pack_version_id, key)
);

create table if not exists public.pack_starter_questions (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references public.pack_versions (id) on delete cascade,
  question text not null,
  skill_key text,
  sort_order integer not null default 0
);

create unique index if not exists pack_starter_questions_unique_idx
  on public.pack_starter_questions (pack_version_id, question);

create table if not exists public.pack_dashboard_config (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references public.pack_versions (id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pack_dashboard_config_unique unique (pack_version_id)
);

-- ---------------------------------------------------------------------------
-- Installations (Space-scoped; "organization" = business/nonprofit Space)
-- ---------------------------------------------------------------------------
create table if not exists public.profile_packs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  pack_id uuid not null references public.packs (id) on delete restrict,
  pack_version_id uuid not null references public.pack_versions (id) on delete restrict,
  status text not null default 'installed'
    check (status in ('installed', 'disabled', 'uninstalling')),
  installed_at timestamptz not null default now(),
  installed_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  configuration jsonb not null default '{}'::jsonb,
  constraint profile_packs_unique unique (profile_id, pack_id)
);

create index if not exists profile_packs_profile_idx
  on public.profile_packs (profile_id, status);

create index if not exists profile_packs_pack_idx
  on public.profile_packs (pack_id);

-- Maps pack recommended Space keys → created/reused guardian_profiles (idempotent)
create table if not exists public.profile_pack_spaces (
  id uuid primary key default gen_random_uuid(),
  profile_pack_id uuid not null references public.profile_packs (id) on delete cascade,
  pack_space_key text not null,
  space_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  created_new boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profile_pack_spaces_unique unique (profile_pack_id, pack_space_key)
);

create index if not exists profile_pack_spaces_space_idx
  on public.profile_pack_spaces (space_profile_id);

create table if not exists public.pack_install_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  pack_id uuid not null references public.packs (id) on delete cascade,
  pack_version_id uuid references public.pack_versions (id) on delete set null,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pack_install_events_profile_idx
  on public.pack_install_events (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- Catalog readable by authenticated users; installs Space-scoped.
-- ---------------------------------------------------------------------------
alter table public.packs enable row level security;
alter table public.pack_versions enable row level security;
alter table public.pack_entity_types enable row level security;
alter table public.pack_relationship_types enable row level security;
alter table public.pack_spaces enable row level security;
alter table public.pack_gideon_skills enable row level security;
alter table public.pack_rules enable row level security;
alter table public.pack_starter_questions enable row level security;
alter table public.pack_dashboard_config enable row level security;
alter table public.profile_packs enable row level security;
alter table public.profile_pack_spaces enable row level security;
alter table public.pack_install_events enable row level security;

-- Catalog: any signed-in user can read published definitions
drop policy if exists "Authenticated users can view packs" on public.packs;
create policy "Authenticated users can view packs"
  on public.packs for select
  to authenticated
  using (status in ('available', 'deprecated'));

drop policy if exists "Authenticated users can view pack versions" on public.pack_versions;
create policy "Authenticated users can view pack versions"
  on public.pack_versions for select
  to authenticated
  using (status in ('published', 'retired'));

drop policy if exists "Authenticated users can view pack entity types" on public.pack_entity_types;
create policy "Authenticated users can view pack entity types"
  on public.pack_entity_types for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can view pack relationship types" on public.pack_relationship_types;
create policy "Authenticated users can view pack relationship types"
  on public.pack_relationship_types for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can view pack spaces" on public.pack_spaces;
create policy "Authenticated users can view pack spaces"
  on public.pack_spaces for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can view pack gideon skills" on public.pack_gideon_skills;
create policy "Authenticated users can view pack gideon skills"
  on public.pack_gideon_skills for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can view pack rules" on public.pack_rules;
create policy "Authenticated users can view pack rules"
  on public.pack_rules for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can view pack starter questions" on public.pack_starter_questions;
create policy "Authenticated users can view pack starter questions"
  on public.pack_starter_questions for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can view pack dashboard config" on public.pack_dashboard_config;
create policy "Authenticated users can view pack dashboard config"
  on public.pack_dashboard_config for select
  to authenticated
  using (true);

-- Installs
drop policy if exists "Members can view profile packs" on public.profile_packs;
create policy "Members can view profile packs"
  on public.profile_packs for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Owners can install profile packs" on public.profile_packs;
create policy "Owners can install profile packs"
  on public.profile_packs for insert
  with check (
    public.can_manage_guardian_profile(profile_id)
    and (installed_by is null or installed_by = auth.uid())
  );

drop policy if exists "Owners can update profile packs" on public.profile_packs;
create policy "Owners can update profile packs"
  on public.profile_packs for update
  using (public.can_manage_guardian_profile(profile_id))
  with check (public.can_manage_guardian_profile(profile_id));

drop policy if exists "Owners can delete profile packs" on public.profile_packs;
create policy "Owners can delete profile packs"
  on public.profile_packs for delete
  using (public.can_manage_guardian_profile(profile_id));

drop policy if exists "Members can view profile pack spaces" on public.profile_pack_spaces;
create policy "Members can view profile pack spaces"
  on public.profile_pack_spaces for select
  using (
    exists (
      select 1 from public.profile_packs pp
      where pp.id = profile_pack_id
        and public.can_access_guardian_profile(pp.profile_id)
    )
  );

drop policy if exists "Owners can manage profile pack spaces" on public.profile_pack_spaces;
create policy "Owners can manage profile pack spaces"
  on public.profile_pack_spaces for all
  using (
    exists (
      select 1 from public.profile_packs pp
      where pp.id = profile_pack_id
        and public.can_manage_guardian_profile(pp.profile_id)
    )
  )
  with check (
    exists (
      select 1 from public.profile_packs pp
      where pp.id = profile_pack_id
        and public.can_manage_guardian_profile(pp.profile_id)
    )
  );

drop policy if exists "Members can view pack install events" on public.pack_install_events;
create policy "Members can view pack install events"
  on public.pack_install_events for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Owners can insert pack install events" on public.pack_install_events;
create policy "Owners can insert pack install events"
  on public.pack_install_events for insert
  with check (
    public.can_manage_guardian_profile(profile_id)
    and (actor_user_id is null or actor_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Seed: Guardian Business Pack #001 v1.0.0 (idempotent)
-- ---------------------------------------------------------------------------
do $$
declare
  v_pack_id uuid;
  v_version_id uuid;
begin
  insert into public.packs (slug, name, description, category, status, pack_number)
  values (
    'guardian-business',
    'Guardian Business',
    'Business operations & organizational intelligence. Teach Guardian how to understand clients, contracts, proposals, projects, and your team.',
    'industry',
    'available',
    1
  )
  on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    status = excluded.status,
    pack_number = excluded.pack_number,
    updated_at = now()
  returning id into v_pack_id;

  select id into v_pack_id from public.packs where slug = 'guardian-business';

  insert into public.pack_versions (pack_id, version, changelog, status, published_at)
  values (
    v_pack_id,
    '1.0.0',
    'Initial Guardian Business Pack: entity types, relationships, recommended Spaces, Business Chief of Staff, dashboard.',
    'published',
    now()
  )
  on conflict (pack_id, version) do update set
    changelog = excluded.changelog,
    status = excluded.status,
    updated_at = now()
  returning id into v_version_id;

  select id into v_version_id
  from public.pack_versions
  where pack_id = v_pack_id and version = '1.0.0';

  -- Entity types
  insert into public.pack_entity_types (pack_version_id, key, label, description, sort_order)
  values
    (v_version_id, 'organization', 'Organization', 'Company or legal entity', 10),
    (v_version_id, 'person', 'Person', 'Individual person', 20),
    (v_version_id, 'employee', 'Employee', 'Team member employed by the organization', 30),
    (v_version_id, 'contractor', 'Contractor', 'External contractor or vendor person', 40),
    (v_version_id, 'client', 'Client', 'Customer or client organization/person', 50),
    (v_version_id, 'contact', 'Contact', 'Business contact', 60),
    (v_version_id, 'opportunity', 'Opportunity', 'Sales or pipeline opportunity', 70),
    (v_version_id, 'proposal', 'Proposal', 'Business proposal', 80),
    (v_version_id, 'contract', 'Contract', 'Signed or draft contract', 90),
    (v_version_id, 'project', 'Project', 'Delivery project or engagement', 100),
    (v_version_id, 'policy', 'Policy', 'Organizational policy', 110),
    (v_version_id, 'procedure', 'Procedure', 'Operating procedure', 120),
    (v_version_id, 'task', 'Task', 'Action item or task', 130)
  on conflict (pack_version_id, key) do update set
    label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

  -- Relationship types
  insert into public.pack_relationship_types (
    pack_version_id, key, label, description, source_entity_type, target_entity_type, sort_order
  )
  values
    (v_version_id, 'EMPLOYS', 'Employs', 'Organization employs a person', 'organization', 'person', 10),
    (v_version_id, 'ENGAGES', 'Engages', 'Organization engages a contractor', 'organization', 'contractor', 20),
    (v_version_id, 'SERVES', 'Serves', 'Organization serves a client', 'organization', 'client', 30),
    (v_version_id, 'CONTACT_FOR', 'Contact for', 'Person is a contact for a client', 'person', 'client', 40),
    (v_version_id, 'WORKS_ON', 'Works on', 'Person works on a project', 'person', 'project', 50),
    (v_version_id, 'HAS_PROJECT', 'Has project', 'Client has a project', 'client', 'project', 60),
    (v_version_id, 'HAS_CONTRACT', 'Has contract', 'Client has a contract', 'client', 'contract', 70),
    (v_version_id, 'PROPOSED_TO', 'Proposed to', 'Proposal proposed to a client', 'proposal', 'client', 80),
    (v_version_id, 'RELATES_TO', 'Relates to', 'Proposal relates to an opportunity', 'proposal', 'opportunity', 90),
    (v_version_id, 'MAY_BECOME', 'May become', 'Proposal may become a project', 'proposal', 'project', 100),
    (v_version_id, 'GOVERNS', 'Governs', 'Contract governs a project', 'contract', 'project', 110),
    (v_version_id, 'APPLIES_TO', 'Applies to', 'Policy applies to a person', 'policy', 'person', 120),
    (v_version_id, 'SUPPORTS', 'Supports', 'Procedure supports a project', 'procedure', 'project', 130),
    (v_version_id, 'ASSIGNED_TO', 'Assigned to', 'Task assigned to a person', 'task', 'person', 140),
    (v_version_id, 'TASK_RELATES_TO', 'Relates to project', 'Task relates to a project', 'task', 'project', 150)
  on conflict (pack_version_id, key) do update set
    label = excluded.label,
    description = excluded.description,
    source_entity_type = excluded.source_entity_type,
    target_entity_type = excluded.target_entity_type,
    sort_order = excluded.sort_order;

  -- Recommended Spaces
  insert into public.pack_spaces (
    pack_version_id, key, display_name, description, profile_type, default_selected, sort_order
  )
  values
    (v_version_id, 'clients', 'Clients', 'Client documents and engagement records', 'other', true, 10),
    (v_version_id, 'contracts', 'Contracts', 'Contracts and agreements', 'other', true, 20),
    (v_version_id, 'proposals', 'Proposals', 'Proposals and estimates', 'other', true, 30),
    (v_version_id, 'operations', 'Operations', 'Day-to-day operations', 'other', true, 40),
    (v_version_id, 'policies_procedures', 'Policies & Procedures', 'Policies and operating procedures', 'other', true, 50),
    (v_version_id, 'team', 'Team', 'Team and HR-related materials', 'other', false, 60)
  on conflict (pack_version_id, key) do update set
    display_name = excluded.display_name,
    description = excluded.description,
    profile_type = excluded.profile_type,
    default_selected = excluded.default_selected,
    sort_order = excluded.sort_order;

  -- Gideon skill
  insert into public.pack_gideon_skills (
    pack_version_id, key, name, description, prompt_addon, sort_order
  )
  values (
    v_version_id,
    'business_chief_of_staff',
    'Business Chief of Staff',
    'Organizational intelligence mode for clients, proposals, contracts, projects, and follow-ups.',
    $prompt$
BUSINESS CHIEF OF STAFF (Guardian Business Pack):
You help the user understand and operate their business using Guardian data.
Distinguish clearly between:
1) Known from Guardian data (ontology entities, relationships, evidence, documents, proposals, connected sources)
2) Gideon's recommendation (advisory judgment based on available context)

Never fabricate organizational facts. If evidence is thin, say what is known and what is missing.
Prefer citing evidence (document names, proposal titles, source items) when stating facts.
For relationship questions, use ontology relationships and linked Spaces.
For analytical questions (outstanding proposals, contracts expiring, tasks needing attention), reason over available structured data and recent activity — do not invent deadlines or clients.
For advisory questions ("what should I follow up on?"), give practical next steps labeled as recommendations.
$prompt$,
    10
  )
  on conflict (pack_version_id, key) do update set
    name = excluded.name,
    description = excluded.description,
    prompt_addon = excluded.prompt_addon,
    sort_order = excluded.sort_order;

  -- Rules
  insert into public.pack_rules (pack_version_id, key, rule_type, definition, sort_order)
  values
    (
      v_version_id,
      'entity_resolution',
      'resolution',
      '{"strategy":"canonical_alias_fuzzy","fuzzy_types":["organization","client","project","contract"],"min_confidence":0.55}'::jsonb,
      10
    ),
    (
      v_version_id,
      'evidence_required',
      'extraction',
      '{"require_evidence_for_ai_relationships":true,"retain_document_and_chunk_refs":true}'::jsonb,
      20
    ),
    (
      v_version_id,
      'no_auto_analyze',
      'lifecycle',
      '{"analyze_existing_requires_explicit_user_action":true}'::jsonb,
      30
    )
  on conflict (pack_version_id, key) do update set
    rule_type = excluded.rule_type,
    definition = excluded.definition,
    sort_order = excluded.sort_order;

  -- Starter questions
  delete from public.pack_starter_questions where pack_version_id = v_version_id;
  insert into public.pack_starter_questions (pack_version_id, question, skill_key, sort_order)
  values
    (v_version_id, 'What clients are we currently working with?', 'business_chief_of_staff', 10),
    (v_version_id, 'Show me everything we know about Proxdose.', 'business_chief_of_staff', 20),
    (v_version_id, 'What proposals are outstanding?', 'business_chief_of_staff', 30),
    (v_version_id, 'Which proposals have not received follow-up?', 'business_chief_of_staff', 40),
    (v_version_id, 'What contracts expire in the next 90 days?', 'business_chief_of_staff', 50),
    (v_version_id, 'Who is working on Client X?', 'business_chief_of_staff', 60),
    (v_version_id, 'What did we promise Client X?', 'business_chief_of_staff', 70),
    (v_version_id, 'What projects are associated with this client?', 'business_chief_of_staff', 80),
    (v_version_id, 'What tasks need attention?', 'business_chief_of_staff', 90),
    (v_version_id, 'What should I follow up on?', 'business_chief_of_staff', 100);

  -- Dashboard cards
  insert into public.pack_dashboard_config (pack_version_id, cards)
  values (
    v_version_id,
    '[
      {"key":"clients","title":"Clients","entityTypes":["client"],"empty":"Connect or analyze business knowledge to discover your clients."},
      {"key":"active_projects","title":"Active Projects","entityTypes":["project"],"empty":"Analyze proposals and documents to discover projects."},
      {"key":"open_proposals","title":"Open Proposals","entityTypes":["proposal"],"source":"proposals","empty":"No open proposals yet."},
      {"key":"contracts","title":"Contracts","entityTypes":["contract"],"empty":"Analyze contracts to track agreements."},
      {"key":"tasks","title":"Tasks Requiring Attention","entityTypes":["task"],"empty":"No tasks discovered yet."},
      {"key":"recent_knowledge","title":"Recent Knowledge","source":"recent_evidence","empty":"Analyze existing knowledge to populate this feed."},
      {"key":"ontology_health","title":"Ontology Health","source":"ontology_stats","empty":"Install and analyze to build your business ontology."}
    ]'::jsonb
  )
  on conflict (pack_version_id) do update set
    cards = excluded.cards,
    updated_at = now();
end $$;
