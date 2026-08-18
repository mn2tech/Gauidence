-- Guardian Leads Phase 1: commercial vs federal partner pipeline,
-- contacts, richer activity, next-action dates, and match fields.
-- Extends existing business_leads / lead_activities. Tenant key remains
-- business_profile_id with membership RLS.

-- ---------------------------------------------------------------------------
-- business_leads: type, federal profile, next action date, match copy
-- ---------------------------------------------------------------------------
alter table public.business_leads
  add column if not exists lead_type text not null default 'commercial';

alter table public.business_leads
  drop constraint if exists business_leads_lead_type_check;
alter table public.business_leads
  add constraint business_leads_lead_type_check
  check (lead_type in ('commercial', 'federal_partner'));

alter table public.business_leads drop constraint if exists business_leads_status_check;
alter table public.business_leads
  add constraint business_leads_status_check
  check (status in (
    'new',
    'researched',
    'research',
    'ready_to_contact',
    'contacted',
    'replied',
    'meeting',
    'demo',
    'follow_up',
    'interested',
    'proposal',
    'won',
    'lost',
    'identified',
    'qualified',
    'contact_ready',
    'capability_meeting',
    'teaming_discussion',
    'opportunity_identified',
    'teaming_subcontract',
    'active_partner',
    'dormant'
  ));

alter table public.business_leads
  add column if not exists linkedin_url text,
  add column if not exists relationship_owner text,
  add column if not exists small_business_status text,
  add column if not exists uei text,
  add column if not exists cage_code text,
  add column if not exists naics_codes text,
  add column if not exists primary_capabilities text,
  add column if not exists federal_agencies_served text,
  add column if not exists contract_vehicles text,
  add column if not exists known_contracts text,
  add column if not exists current_opportunities text,
  add column if not exists past_performance_areas text,
  add column if not exists technology_areas text,
  add column if not exists market_agency text,
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_action_date date,
  add column if not exists match_explanation text,
  add column if not exists recommended_approach text;

create index if not exists business_leads_business_type_idx
  on public.business_leads (business_profile_id, lead_type, updated_at desc);

create index if not exists business_leads_next_action_date_idx
  on public.business_leads (business_profile_id, next_action_date)
  where next_action_date is not null;

-- ---------------------------------------------------------------------------
-- lead_contacts: multiple people per company/lead
-- ---------------------------------------------------------------------------
create table if not exists public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.business_leads (id) on delete cascade,
  full_name text not null,
  job_title text,
  email text,
  phone text,
  linkedin_url text,
  is_primary boolean not null default false,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_contacts_name_required check (char_length(trim(full_name)) > 0)
);

create index if not exists lead_contacts_lead_idx
  on public.lead_contacts (lead_id, is_primary desc, created_at);

-- ---------------------------------------------------------------------------
-- lead_opportunities: partner ↔ opportunity (many-to-many ready)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_opportunities (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  lead_id uuid references public.business_leads (id) on delete set null,
  title text not null,
  agency text,
  notes text,
  status text not null default 'identified'
    check (status in (
      'identified',
      'tracking',
      'teaming',
      'submitted',
      'won',
      'lost',
      'inactive'
    )),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_opportunities_title_required check (char_length(trim(title)) > 0)
);

create index if not exists lead_opportunities_business_idx
  on public.lead_opportunities (business_profile_id, updated_at desc);

create index if not exists lead_opportunities_lead_idx
  on public.lead_opportunities (lead_id)
  where lead_id is not null;

-- ---------------------------------------------------------------------------
-- lead_activities: richer interaction types + optional contact
-- ---------------------------------------------------------------------------
alter table public.lead_activities
  add column if not exists contact_id uuid references public.lead_contacts (id) on delete set null,
  add column if not exists occurred_at timestamptz;

alter table public.lead_activities drop constraint if exists lead_activities_activity_type_check;
alter table public.lead_activities
  add constraint lead_activities_activity_type_check
  check (activity_type in (
    'created',
    'researched',
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
alter table public.lead_contacts enable row level security;
alter table public.lead_opportunities enable row level security;

drop policy if exists "Members can view lead contacts" on public.lead_contacts;
create policy "Members can view lead contacts"
  on public.lead_contacts for select
  using (
    exists (
      select 1 from public.business_leads l
      where l.id = lead_id
        and public.can_access_guardian_profile(l.business_profile_id)
    )
  );

drop policy if exists "Editors can insert lead contacts" on public.lead_contacts;
create policy "Editors can insert lead contacts"
  on public.lead_contacts for insert
  with check (
    exists (
      select 1 from public.business_leads l
      where l.id = lead_id
        and public.can_edit_guardian_profile(l.business_profile_id)
    )
  );

drop policy if exists "Editors can update lead contacts" on public.lead_contacts;
create policy "Editors can update lead contacts"
  on public.lead_contacts for update
  using (
    exists (
      select 1 from public.business_leads l
      where l.id = lead_id
        and public.can_edit_guardian_profile(l.business_profile_id)
    )
  )
  with check (
    exists (
      select 1 from public.business_leads l
      where l.id = lead_id
        and public.can_edit_guardian_profile(l.business_profile_id)
    )
  );

drop policy if exists "Editors can delete lead contacts" on public.lead_contacts;
create policy "Editors can delete lead contacts"
  on public.lead_contacts for delete
  using (
    exists (
      select 1 from public.business_leads l
      where l.id = lead_id
        and public.can_edit_guardian_profile(l.business_profile_id)
    )
  );

drop policy if exists "Members can view lead opportunities" on public.lead_opportunities;
create policy "Members can view lead opportunities"
  on public.lead_opportunities for select
  using (public.can_access_guardian_profile(business_profile_id));

drop policy if exists "Editors can insert lead opportunities" on public.lead_opportunities;
create policy "Editors can insert lead opportunities"
  on public.lead_opportunities for insert
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Editors can update lead opportunities" on public.lead_opportunities;
create policy "Editors can update lead opportunities"
  on public.lead_opportunities for update
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Editors can delete lead opportunities" on public.lead_opportunities;
create policy "Editors can delete lead opportunities"
  on public.lead_opportunities for delete
  using (public.can_edit_guardian_profile(business_profile_id));
