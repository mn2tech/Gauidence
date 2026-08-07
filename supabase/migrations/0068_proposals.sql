-- Business proposals: create, send, track, and accept client proposals.
-- Stored on client vaults under a business; supports templates, analytics, and portal access.

-- ---------------------------------------------------------------------------
-- Proposal templates (business-level reusable starting points)
-- ---------------------------------------------------------------------------
create table if not exists public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  default_title text,
  default_summary text,
  default_introduction text,
  default_terms text,
  default_line_items jsonb not null default '[]'::jsonb,
  default_timeline jsonb not null default '[]'::jsonb,
  default_deliverables jsonb not null default '[]'::jsonb,
  default_addons jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_templates_name_not_empty check (char_length(trim(name)) > 0)
);

create index if not exists proposal_templates_business_idx
  on public.proposal_templates (business_profile_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Service templates (reusable catalog line items)
-- ---------------------------------------------------------------------------
create table if not exists public.service_templates (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  unit_label text not null default 'each',
  unit_price_cents integer not null default 0
    check (unit_price_cents >= 0),
  default_quantity numeric(10,2) not null default 1
    check (default_quantity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_templates_name_not_empty check (char_length(trim(name)) > 0)
);

create index if not exists service_templates_business_idx
  on public.service_templates (business_profile_id, name asc);

-- ---------------------------------------------------------------------------
-- Proposals (scoped to business + client vault)
-- ---------------------------------------------------------------------------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  client_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  template_id uuid references public.proposal_templates (id) on delete set null,
  title text not null,
  summary text,
  introduction text,
  terms text,
  status text not null default 'draft'
    check (status in (
      'draft',
      'sent',
      'viewed',
      'changes_requested',
      'accepted',
      'declined',
      'expired'
    )),
  version integer not null default 1 check (version >= 1),
  currency text not null default 'USD',
  tax_rate_bps integer not null default 0 check (tax_rate_bps >= 0),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  line_items jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  deliverables jsonb not null default '[]'::jsonb,
  addons jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  client_feedback text,
  document_id uuid references public.documents (id) on delete set null,
  work_project_id uuid references public.work_projects (id) on delete set null,
  portal_token_hash text,
  portal_token_expires_at timestamptz,
  external_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposals_title_not_empty check (char_length(trim(title)) > 0)
);

create index if not exists proposals_business_status_idx
  on public.proposals (business_profile_id, status, updated_at desc);

create index if not exists proposals_client_idx
  on public.proposals (client_profile_id, status, updated_at desc);

create unique index if not exists proposals_portal_token_hash_unique
  on public.proposals (portal_token_hash)
  where portal_token_hash is not null;

-- ---------------------------------------------------------------------------
-- Proposal analytics events
-- ---------------------------------------------------------------------------
create table if not exists public.proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  event_type text not null
    check (event_type in (
      'created',
      'updated',
      'sent',
      'viewed',
      'exported',
      'changes_requested',
      'accepted',
      'declined',
      'expired',
      'project_created',
      'contract_generated',
      'deposit_invoice_generated'
    )),
  actor_user_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists proposal_events_proposal_idx
  on public.proposal_events (proposal_id, created_at desc);

create index if not exists proposal_events_type_idx
  on public.proposal_events (event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.proposal_templates enable row level security;
alter table public.service_templates enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_events enable row level security;

drop policy if exists "Business members can view proposal templates" on public.proposal_templates;
create policy "Business members can view proposal templates"
  on public.proposal_templates for select
  using (public.can_access_guardian_profile(business_profile_id));

drop policy if exists "Business editors can insert proposal templates" on public.proposal_templates;
create policy "Business editors can insert proposal templates"
  on public.proposal_templates for insert
  with check (
    public.can_edit_guardian_profile(business_profile_id)
    and auth.uid() = created_by
  );

drop policy if exists "Business editors can update proposal templates" on public.proposal_templates;
create policy "Business editors can update proposal templates"
  on public.proposal_templates for update
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Business owners can delete proposal templates" on public.proposal_templates;
create policy "Business owners can delete proposal templates"
  on public.proposal_templates for delete
  using (public.can_manage_guardian_profile(business_profile_id));

drop policy if exists "Business members can view service templates" on public.service_templates;
create policy "Business members can view service templates"
  on public.service_templates for select
  using (public.can_access_guardian_profile(business_profile_id));

drop policy if exists "Business editors can insert service templates" on public.service_templates;
create policy "Business editors can insert service templates"
  on public.service_templates for insert
  with check (
    public.can_edit_guardian_profile(business_profile_id)
    and auth.uid() = created_by
  );

drop policy if exists "Business editors can update service templates" on public.service_templates;
create policy "Business editors can update service templates"
  on public.service_templates for update
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Business owners can delete service templates" on public.service_templates;
create policy "Business owners can delete service templates"
  on public.service_templates for delete
  using (public.can_manage_guardian_profile(business_profile_id));

drop policy if exists "Members can view proposals" on public.proposals;
create policy "Members can view proposals"
  on public.proposals for select
  using (
    public.can_access_guardian_profile(business_profile_id)
    or (
      public.can_access_guardian_profile(client_profile_id)
      and status <> 'draft'
    )
  );

drop policy if exists "Business editors can create proposals" on public.proposals;
create policy "Business editors can create proposals"
  on public.proposals for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_guardian_profile(business_profile_id)
  );

drop policy if exists "Business editors can update proposals" on public.proposals;
create policy "Business editors can update proposals"
  on public.proposals for update
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Business owners can delete proposals" on public.proposals;
create policy "Business owners can delete proposals"
  on public.proposals for delete
  using (public.can_manage_guardian_profile(business_profile_id));

drop policy if exists "Members can view proposal events" on public.proposal_events;
create policy "Members can view proposal events"
  on public.proposal_events for select
  using (
    exists (
      select 1
      from public.proposals p
      where p.id = proposal_id
        and (
          public.can_access_guardian_profile(p.business_profile_id)
          or (
            public.can_access_guardian_profile(p.client_profile_id)
            and p.status <> 'draft'
          )
        )
    )
  );

drop policy if exists "Members can insert proposal events" on public.proposal_events;
create policy "Members can insert proposal events"
  on public.proposal_events for insert
  with check (
    exists (
      select 1
      from public.proposals p
      where p.id = proposal_id
        and (
          public.can_edit_guardian_profile(p.business_profile_id)
          or (
            public.can_access_guardian_profile(p.client_profile_id)
            and p.status in ('sent', 'viewed', 'changes_requested')
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.proposals_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.status = 'accepted' and (old is null or old.status is distinct from 'accepted') then
    new.accepted_at = coalesce(new.accepted_at, now());
  elsif new.status is distinct from 'accepted' and old is not null and old.status = 'accepted' then
    new.accepted_at = null;
  end if;
  if new.status = 'declined' and (old is null or old.status is distinct from 'declined') then
    new.declined_at = coalesce(new.declined_at, now());
  elsif new.status is distinct from 'declined' and old is not null and old.status = 'declined' then
    new.declined_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists proposals_updated_at on public.proposals;
create trigger proposals_updated_at
  before update on public.proposals
  for each row execute function public.proposals_set_updated_at();

create or replace function public.proposal_templates_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists proposal_templates_updated_at on public.proposal_templates;
create trigger proposal_templates_updated_at
  before update on public.proposal_templates
  for each row execute function public.proposal_templates_set_updated_at();

create or replace function public.service_templates_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_templates_set_updated_at on public.service_templates;
create trigger service_templates_set_updated_at
  before update on public.service_templates
  for each row execute function public.service_templates_set_updated_at();
