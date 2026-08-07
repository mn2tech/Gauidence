-- Business Advisor: website/security assessments → opportunities → priced proposals.

-- ---------------------------------------------------------------------------
-- Service catalog (Guardian solutions with internal pricing math)
-- ---------------------------------------------------------------------------
create table if not exists public.advisor_service_catalog (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  service_key text not null,
  name text not null,
  category text not null default 'general',
  description text,
  estimated_hours numeric(8,2) not null default 8 check (estimated_hours > 0),
  hourly_rate_cents integer not null default 15000 check (hourly_rate_cents >= 0),
  minimum_price_cents integer not null default 0 check (minimum_price_cents >= 0),
  maximum_price_cents integer check (maximum_price_cents is null or maximum_price_cents >= minimum_price_cents),
  subscription_monthly_cents integer check (subscription_monthly_cents is null or subscription_monthly_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_profile_id, service_key)
);

create index if not exists advisor_service_catalog_business_idx
  on public.advisor_service_catalog (business_profile_id, category);

-- ---------------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------------
create table if not exists public.business_assessments (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  client_profile_id uuid references public.guardian_profiles (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete cascade,
  company_name text not null,
  website_url text not null,
  industry text,
  status text not null default 'draft'
    check (status in ('draft', 'analyzing', 'complete', 'failed')),
  executive_summary text,
  report_json jsonb not null default '{}'::jsonb,
  error_message text,
  analyzed_at timestamptz,
  proposal_id uuid references public.proposals (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_assessments_company_not_empty check (char_length(trim(company_name)) > 0),
  constraint business_assessments_url_not_empty check (char_length(trim(website_url)) > 0)
);

create index if not exists business_assessments_business_idx
  on public.business_assessments (business_profile_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Findings from analyzers
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_findings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.business_assessments (id) on delete cascade,
  analyzer text not null,
  category text not null,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  description text not null,
  business_impact text,
  recommendation text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assessment_findings_assessment_idx
  on public.assessment_findings (assessment_id, severity);

-- ---------------------------------------------------------------------------
-- Opportunities derived from findings
-- ---------------------------------------------------------------------------
create table if not exists public.business_opportunities (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.business_assessments (id) on delete cascade,
  finding_id uuid references public.assessment_findings (id) on delete set null,
  title text not null,
  description text not null,
  category text not null,
  estimated_impact text not null default 'medium'
    check (estimated_impact in ('low', 'medium', 'high')),
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),
  priority integer not null default 50,
  potential_outcome text,
  guardian_solution_key text,
  created_at timestamptz not null default now()
);

create index if not exists business_opportunities_assessment_idx
  on public.business_opportunities (assessment_id, priority desc);

-- ---------------------------------------------------------------------------
-- Recommended solutions with pricing snapshot
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_recommended_solutions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.business_assessments (id) on delete cascade,
  service_key text not null,
  title text not null,
  description text,
  reason text,
  business_value text,
  estimated_roi text,
  implementation_time text,
  price_cents integer not null default 0 check (price_cents >= 0),
  hours numeric(8,2),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists assessment_recommended_solutions_assessment_idx
  on public.assessment_recommended_solutions (assessment_id, sort_order);

-- ---------------------------------------------------------------------------
-- Executive business outcomes
-- ---------------------------------------------------------------------------
create table if not exists public.business_outcomes (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.business_assessments (id) on delete cascade,
  outcome_text text not null,
  measurable_metric text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists business_outcomes_assessment_idx
  on public.business_outcomes (assessment_id, sort_order);

-- Link proposals back to assessments
alter table public.proposals
  add column if not exists assessment_id uuid references public.business_assessments (id) on delete set null;

create index if not exists proposals_assessment_idx
  on public.proposals (assessment_id)
  where assessment_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.advisor_service_catalog enable row level security;
alter table public.business_assessments enable row level security;
alter table public.assessment_findings enable row level security;
alter table public.business_opportunities enable row level security;
alter table public.assessment_recommended_solutions enable row level security;
alter table public.business_outcomes enable row level security;

drop policy if exists "Business members view advisor catalog" on public.advisor_service_catalog;
create policy "Business members view advisor catalog"
  on public.advisor_service_catalog for select
  using (public.can_access_guardian_profile(business_profile_id));

drop policy if exists "Business editors manage advisor catalog" on public.advisor_service_catalog;
create policy "Business editors manage advisor catalog"
  on public.advisor_service_catalog for all
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Business members view assessments" on public.business_assessments;
create policy "Business members view assessments"
  on public.business_assessments for select
  using (public.can_access_guardian_profile(business_profile_id));

drop policy if exists "Business editors manage assessments" on public.business_assessments;
create policy "Business editors insert assessments"
  on public.business_assessments for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_guardian_profile(business_profile_id)
  );

drop policy if exists "Business editors update assessments" on public.business_assessments;
create policy "Business editors update assessments"
  on public.business_assessments for update
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Business owners delete assessments" on public.business_assessments;
create policy "Business owners delete assessments"
  on public.business_assessments for delete
  using (public.can_manage_guardian_profile(business_profile_id));

drop policy if exists "Members view assessment findings" on public.assessment_findings;
create policy "Members view assessment findings"
  on public.assessment_findings for select
  using (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_access_guardian_profile(a.business_profile_id)
    )
  );

drop policy if exists "Editors manage assessment findings" on public.assessment_findings;
create policy "Editors manage assessment findings"
  on public.assessment_findings for all
  using (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_edit_guardian_profile(a.business_profile_id)
    )
  )
  with check (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_edit_guardian_profile(a.business_profile_id)
    )
  );

drop policy if exists "Members view opportunities" on public.business_opportunities;
create policy "Members view opportunities"
  on public.business_opportunities for select
  using (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_access_guardian_profile(a.business_profile_id)
    )
  );

drop policy if exists "Editors manage opportunities" on public.business_opportunities;
create policy "Editors manage opportunities"
  on public.business_opportunities for all
  using (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_edit_guardian_profile(a.business_profile_id)
    )
  )
  with check (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_edit_guardian_profile(a.business_profile_id)
    )
  );

drop policy if exists "Members view recommended solutions" on public.assessment_recommended_solutions;
create policy "Members view recommended solutions"
  on public.assessment_recommended_solutions for select
  using (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_access_guardian_profile(a.business_profile_id)
    )
  );

drop policy if exists "Editors manage recommended solutions" on public.assessment_recommended_solutions;
create policy "Editors manage recommended solutions"
  on public.assessment_recommended_solutions for all
  using (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_edit_guardian_profile(a.business_profile_id)
    )
  )
  with check (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_edit_guardian_profile(a.business_profile_id)
    )
  );

drop policy if exists "Members view business outcomes" on public.business_outcomes;
create policy "Members view business outcomes"
  on public.business_outcomes for select
  using (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_access_guardian_profile(a.business_profile_id)
    )
  );

drop policy if exists "Editors manage business outcomes" on public.business_outcomes;
create policy "Editors manage business outcomes"
  on public.business_outcomes for all
  using (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_edit_guardian_profile(a.business_profile_id)
    )
  )
  with check (
    exists (
      select 1 from public.business_assessments a
      where a.id = assessment_id
        and public.can_edit_guardian_profile(a.business_profile_id)
    )
  );

create or replace function public.business_assessments_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_assessments_updated_at on public.business_assessments;
create trigger business_assessments_updated_at
  before update on public.business_assessments
  for each row execute function public.business_assessments_set_updated_at();
