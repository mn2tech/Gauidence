-- Business leads: lightweight opportunity tracking for business workspaces.
-- Scoped to business_profile_id with membership-based RLS.

-- ---------------------------------------------------------------------------
-- business_leads
-- ---------------------------------------------------------------------------
create table if not exists public.business_leads (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  company_name text,
  contact_name text,
  job_title text,
  email text,
  phone text,
  website text,
  address text,
  source text,
  source_detail text,
  notes text,
  status text not null default 'new'
    check (status in (
      'new',
      'researched',
      'contacted',
      'follow_up',
      'interested',
      'proposal',
      'won',
      'lost'
    )),
  lead_score smallint check (lead_score >= 0 and lead_score <= 100),
  recommended_service text,
  opportunity_summary text,
  conversation_angle text,
  next_action text,
  last_activity_at timestamptz,
  proposal_id uuid references public.proposals (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_leads_name_required check (
    char_length(trim(coalesce(company_name, ''))) > 0
    or char_length(trim(coalesce(contact_name, ''))) > 0
  )
);

create index if not exists business_leads_business_status_idx
  on public.business_leads (business_profile_id, status, updated_at desc);

create index if not exists business_leads_business_email_idx
  on public.business_leads (business_profile_id, lower(email))
  where email is not null and char_length(trim(email)) > 0;

create index if not exists business_leads_business_company_idx
  on public.business_leads (business_profile_id, lower(company_name))
  where company_name is not null and char_length(trim(company_name)) > 0;

-- ---------------------------------------------------------------------------
-- lead_activities
-- ---------------------------------------------------------------------------
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.business_leads (id) on delete cascade,
  activity_type text not null
    check (activity_type in (
      'created',
      'researched',
      'note',
      'outreach_drafted',
      'contacted',
      'follow_up',
      'status_changed',
      'proposal_created'
    )),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_activities_lead_idx
  on public.lead_activities (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.business_leads enable row level security;
alter table public.lead_activities enable row level security;

drop policy if exists "Business members can view leads" on public.business_leads;
create policy "Business members can view leads"
  on public.business_leads for select
  using (public.can_access_guardian_profile(business_profile_id));

drop policy if exists "Business editors can create leads" on public.business_leads;
create policy "Business editors can create leads"
  on public.business_leads for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_guardian_profile(business_profile_id)
  );

drop policy if exists "Business editors can update leads" on public.business_leads;
create policy "Business editors can update leads"
  on public.business_leads for update
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Business owners can delete leads" on public.business_leads;
create policy "Business owners can delete leads"
  on public.business_leads for delete
  using (public.can_manage_guardian_profile(business_profile_id));

drop policy if exists "Members can view lead activities" on public.lead_activities;
create policy "Members can view lead activities"
  on public.lead_activities for select
  using (
    exists (
      select 1
      from public.business_leads l
      where l.id = lead_id
        and public.can_access_guardian_profile(l.business_profile_id)
    )
  );

drop policy if exists "Editors can insert lead activities" on public.lead_activities;
create policy "Editors can insert lead activities"
  on public.lead_activities for insert
  with check (
    exists (
      select 1
      from public.business_leads l
      where l.id = lead_id
        and public.can_edit_guardian_profile(l.business_profile_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.business_leads_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_leads_updated_at on public.business_leads;
create trigger business_leads_updated_at
  before update on public.business_leads
  for each row execute function public.business_leads_set_updated_at();
