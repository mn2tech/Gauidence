-- Guardian Business Pack V1.1 — Gideon Business Intelligence
-- Commitments, insights, claim tracking, pack version 1.1.0
--
-- Rollback (manual):
--   delete from public.pack_versions where version = '1.1.0'
--     and pack_id = (select id from public.packs where slug = 'guardian-business');
--   alter table public.vault_chat_messages drop column if exists claims;
--   drop table if exists public.business_insights;
--   drop table if exists public.business_commitments;

-- ---------------------------------------------------------------------------
-- business_commitments (org Space-scoped via organization_id = guardian_profiles.id)
-- ---------------------------------------------------------------------------
create table if not exists public.business_commitments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.guardian_profiles (id) on delete cascade,
  client_entity_id uuid references public.ontology_entities (id) on delete set null,
  source_entity_id uuid references public.ontology_entities (id) on delete set null,
  description text not null,
  commitment_type text,
  status text not null default 'UNKNOWN'
    check (status in (
      'PROPOSED', 'RECOMMENDED', 'AGREED', 'COMMITTED',
      'COMPLETED', 'CANCELLED', 'UNKNOWN'
    )),
  due_date date,
  owner_entity_id uuid references public.ontology_entities (id) on delete set null,
  confidence numeric,
  evidence_id uuid references public.ontology_evidence (id) on delete set null,
  external_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_commitments_org_external_unique
    unique (organization_id, external_key)
);

create index if not exists business_commitments_org_idx
  on public.business_commitments (organization_id, updated_at desc);

create index if not exists business_commitments_client_idx
  on public.business_commitments (client_entity_id)
  where client_entity_id is not null;

alter table public.business_commitments enable row level security;

drop policy if exists "Members can view business commitments" on public.business_commitments;
create policy "Members can view business commitments"
  on public.business_commitments for select
  using (public.can_access_guardian_profile(organization_id));

drop policy if exists "Editors can insert business commitments" on public.business_commitments;
create policy "Editors can insert business commitments"
  on public.business_commitments for insert
  with check (public.can_access_guardian_profile(organization_id));

drop policy if exists "Editors can update business commitments" on public.business_commitments;
create policy "Editors can update business commitments"
  on public.business_commitments for update
  using (public.can_access_guardian_profile(organization_id))
  with check (public.can_access_guardian_profile(organization_id));

drop policy if exists "Owners can delete business commitments" on public.business_commitments;
create policy "Owners can delete business commitments"
  on public.business_commitments for delete
  using (public.can_manage_guardian_profile(organization_id));

-- ---------------------------------------------------------------------------
-- business_insights (V1.1 advisory foundation; V1.2 proactive notifications)
-- ---------------------------------------------------------------------------
create table if not exists public.business_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.guardian_profiles (id) on delete cascade,
  type text not null,
  entity_id uuid references public.ontology_entities (id) on delete set null,
  title text not null,
  summary text not null default '',
  priority numeric not null default 0,
  confidence numeric,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'dismissed', 'acted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_insights_org_priority_idx
  on public.business_insights (organization_id, status, priority desc);

alter table public.business_insights enable row level security;

drop policy if exists "Members can view business insights" on public.business_insights;
create policy "Members can view business insights"
  on public.business_insights for select
  using (public.can_access_guardian_profile(organization_id));

drop policy if exists "Editors can insert business insights" on public.business_insights;
create policy "Editors can insert business insights"
  on public.business_insights for insert
  with check (public.can_access_guardian_profile(organization_id));

drop policy if exists "Editors can update business insights" on public.business_insights;
create policy "Editors can update business insights"
  on public.business_insights for update
  using (public.can_access_guardian_profile(organization_id))
  with check (public.can_access_guardian_profile(organization_id));

drop policy if exists "Owners can delete business insights" on public.business_insights;
create policy "Owners can delete business insights"
  on public.business_insights for delete
  using (public.can_manage_guardian_profile(organization_id));

-- ---------------------------------------------------------------------------
-- Claim tracking on vault chat messages (for "Where did you get that?")
-- ---------------------------------------------------------------------------
alter table public.vault_chat_messages
  add column if not exists claims jsonb not null default '[]'::jsonb;

comment on column public.vault_chat_messages.claims is
  'Structured Gideon claims + evidence refs for Business Intelligence follow-ups.';

-- ---------------------------------------------------------------------------
-- Pack version 1.1.0 (idempotent)
-- ---------------------------------------------------------------------------
do $$
declare
  v_pack_id uuid;
  v_version_id uuid;
  v_v10_id uuid;
begin
  select id into v_pack_id from public.packs where slug = 'guardian-business';
  if v_pack_id is null then
    raise notice 'guardian-business pack missing; skip 1.1.0 seed';
    return;
  end if;

  insert into public.pack_versions (pack_id, version, changelog, status, published_at)
  values (
    v_pack_id,
    '1.1.0',
    'Gideon Business Intelligence: query planner, Entity 360, relationship reasoning, proposal follow-up scoring, commitments, claim/evidence tracking, advisory priorities, knowledge filtering.',
    'published',
    now()
  )
  on conflict (pack_id, version) do update set
    changelog = excluded.changelog,
    status = excluded.status,
    published_at = coalesce(public.pack_versions.published_at, excluded.published_at),
    updated_at = now();

  select id into v_version_id
  from public.pack_versions
  where pack_id = v_pack_id and version = '1.1.0';

  select id into v_v10_id
  from public.pack_versions
  where pack_id = v_pack_id and version = '1.0.0';

  -- Copy core definition rows from 1.0.0 when present
  if v_v10_id is not null then
    insert into public.pack_entity_types (pack_version_id, key, label, description, sort_order)
    select v_version_id, key, label, description, sort_order
    from public.pack_entity_types
    where pack_version_id = v_v10_id
    on conflict (pack_version_id, key) do update set
      label = excluded.label,
      description = excluded.description,
      sort_order = excluded.sort_order;

    insert into public.pack_relationship_types (
      pack_version_id, key, label, description,
      source_entity_type, target_entity_type, sort_order
    )
    select
      v_version_id, key, label, description,
      source_entity_type, target_entity_type, sort_order
    from public.pack_relationship_types
    where pack_version_id = v_v10_id
    on conflict (pack_version_id, key) do update set
      label = excluded.label,
      description = excluded.description,
      source_entity_type = excluded.source_entity_type,
      target_entity_type = excluded.target_entity_type,
      sort_order = excluded.sort_order;

    insert into public.pack_spaces (
      pack_version_id, key, display_name, description, profile_type, default_selected, sort_order
    )
    select
      v_version_id, key, display_name, description, profile_type, default_selected, sort_order
    from public.pack_spaces
    where pack_version_id = v_v10_id
    on conflict (pack_version_id, key) do update set
      display_name = excluded.display_name,
      description = excluded.description,
      profile_type = excluded.profile_type,
      default_selected = excluded.default_selected,
      sort_order = excluded.sort_order;
  end if;

  insert into public.pack_entity_types (pack_version_id, key, label, description, sort_order)
  values (
    v_version_id,
    'commitment',
    'Commitment',
    'Something promised, agreed, recommended, or owed to a client.',
    140
  )
  on conflict (pack_version_id, key) do update set
    label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

  insert into public.pack_gideon_skills (
    pack_version_id, key, name, description, prompt_addon, sort_order
  )
  values (
    v_version_id,
    'business_intelligence',
    'Business Intelligence',
    'Query planner + Entity 360 + relationship/proposal/commitment reasoning.',
    $skill$BUSINESS INTELLIGENCE (Guardian Business Pack V1.1):
Reason over Guardian ontology and structured business data. Do not dump raw extraction lists.
Distinguish Known from Guardian vs Gideon recommendation.
For Entity 360 questions, give a concise business summary (identity, relationships, proposals, projects, commitments, risks, sources).
Never present system/process metadata (queued documents, extraction jobs) as client facts.
When asked where information came from, use prior claim evidence.$skill$,
    20
  )
  on conflict (pack_version_id, key) do update set
    name = excluded.name,
    description = excluded.description,
    prompt_addon = excluded.prompt_addon,
    sort_order = excluded.sort_order;

  insert into public.pack_gideon_skills (
    pack_version_id, key, name, description, prompt_addon, sort_order
  )
  values (
    v_version_id,
    'business_chief_of_staff',
    'Business Chief of Staff',
    'Organizational intelligence mode for clients, proposals, contracts, projects, and follow-ups.',
    $prompt$BUSINESS CHIEF OF STAFF (Guardian Business Pack V1.1):
You help the user understand and operate their business using Guardian data.
When BUSINESS INTELLIGENCE context is present, prefer it over raw excerpt dumps.
Distinguish clearly between Known from Guardian data and Gideon's recommendation.
Never fabricate organizational facts. Prefer Entity 360 summaries over raw ontology dumps.
Never present system/process metadata as client business facts.
For advisory questions, rank priorities with Why, Evidence, Confidence, and Recommended next step.$prompt$,
    10
  )
  on conflict (pack_version_id, key) do update set
    name = excluded.name,
    description = excluded.description,
    prompt_addon = excluded.prompt_addon,
    sort_order = excluded.sort_order;

  insert into public.pack_rules (pack_version_id, key, rule_type, definition, sort_order)
  values (
    v_version_id,
    'business_intelligence_v1_1',
    'reasoning',
    jsonb_build_object(
      'query_planner', true,
      'entity_360', true,
      'knowledge_filter', true,
      'proposal_follow_up', jsonb_build_object('stale_days', 7),
      'facts_vs_recommendations', true
    ),
    40
  )
  on conflict (pack_version_id, key) do update set
    rule_type = excluded.rule_type,
    definition = excluded.definition,
    sort_order = excluded.sort_order;

  delete from public.pack_starter_questions where pack_version_id = v_version_id;
  insert into public.pack_starter_questions (pack_version_id, question, skill_key, sort_order)
  values
    (v_version_id, 'Show me everything we know about Proxdose.', 'business_intelligence', 10),
    (v_version_id, 'Which clients have proposals but no active project?', 'business_intelligence', 20),
    (v_version_id, 'What proposals need follow-up?', 'business_intelligence', 30),
    (v_version_id, 'What relationships do we have with Onyx?', 'business_intelligence', 40),
    (v_version_id, 'What commitments have we made to each client?', 'business_intelligence', 50),
    (v_version_id, 'Where did you get that information?', 'business_intelligence', 60),
    (v_version_id, 'What should I focus on next?', 'business_intelligence', 70);
end $$;
