-- Employee Hub: per-employee feature entitlements, manual time, leave requests.

-- ---------------------------------------------------------------------------
-- employee_hub_entitlements (owner-controlled feature flags per employee)
-- ---------------------------------------------------------------------------
create table if not exists public.employee_hub_entitlements (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  employee_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  time_tracking boolean not null default true,
  manual_time_entry boolean not null default true,
  status_reports boolean not null default true,
  invoice_upload boolean not null default false,
  leave_requests boolean not null default true,
  documents boolean not null default false,
  gideon_chat boolean not null default true,
  research boolean not null default false,
  work_memory boolean not null default false,
  experts boolean not null default false,
  recruit boolean not null default false,
  payroll_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_profile_id)
);

create index if not exists employee_hub_entitlements_business_idx
  on public.employee_hub_entitlements (business_profile_id);

-- ---------------------------------------------------------------------------
-- payroll_time_entries: support manual daily hours
-- ---------------------------------------------------------------------------
alter table public.payroll_time_entries
  add column if not exists entry_type text not null default 'punch'
    check (entry_type in ('punch', 'manual'));

alter table public.payroll_time_entries
  add column if not exists work_date date;

alter table public.payroll_time_entries
  add column if not exists manual_hours numeric(10,2);

alter table public.payroll_time_entries
  alter column clock_in_at drop not null;

comment on column public.payroll_time_entries.entry_type is
  'punch = clock in/out; manual = owner or employee entered hours for work_date.';

-- Employees with vault access can manage their own time entries
create or replace function public.can_access_own_payroll_time_entry(
  p_profile_id uuid,
  p_employee_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_profiles gp
    where gp.id = p_employee_profile_id
      and gp.profile_type = 'employee'
      and gp.parent_profile_id = p_profile_id
      and public.can_access_guardian_profile(p_employee_profile_id)
  );
$$;

drop policy if exists "Employees can view own time entries" on public.payroll_time_entries;
create policy "Employees can view own time entries"
  on public.payroll_time_entries for select
  using (public.can_access_own_payroll_time_entry(profile_id, employee_profile_id));

drop policy if exists "Employees can manage own time entries" on public.payroll_time_entries;
create policy "Employees can manage own time entries"
  on public.payroll_time_entries for all
  using (public.can_access_own_payroll_time_entry(profile_id, employee_profile_id))
  with check (public.can_access_own_payroll_time_entry(profile_id, employee_profile_id));

-- ---------------------------------------------------------------------------
-- employee_leave_requests
-- ---------------------------------------------------------------------------
create table if not exists public.employee_leave_requests (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  employee_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  leave_type text not null default 'pto'
    check (leave_type in ('pto', 'sick', 'ooo', 'other')),
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'cancelled')),
  created_by uuid not null references auth.users (id) on delete cascade,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_leave_dates_order check (end_date >= start_date)
);

create index if not exists employee_leave_requests_employee_idx
  on public.employee_leave_requests (employee_profile_id, start_date desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.employee_hub_entitlements enable row level security;
alter table public.employee_leave_requests enable row level security;

create or replace function public.can_access_employee_hub_entitlement(p_employee_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employee_hub_entitlements e
    where e.employee_profile_id = p_employee_profile_id
      and (
        public.can_edit_guardian_profile(e.business_profile_id)
        or public.can_access_guardian_profile(p_employee_profile_id)
      )
  );
$$;

drop policy if exists "Business editors can manage employee entitlements" on public.employee_hub_entitlements;
create policy "Business editors can manage employee entitlements"
  on public.employee_hub_entitlements for all
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Employees can view own entitlements" on public.employee_hub_entitlements;
create policy "Employees can view own entitlements"
  on public.employee_hub_entitlements for select
  using (public.can_access_guardian_profile(employee_profile_id));

drop policy if exists "Business editors can manage leave requests" on public.employee_leave_requests;
create policy "Business editors can manage leave requests"
  on public.employee_leave_requests for all
  using (public.can_edit_guardian_profile(business_profile_id))
  with check (public.can_edit_guardian_profile(business_profile_id));

drop policy if exists "Employees can view and create own leave" on public.employee_leave_requests;
create policy "Employees can view and create own leave"
  on public.employee_leave_requests for select
  using (public.can_access_guardian_profile(employee_profile_id));

drop policy if exists "Employees can insert own leave" on public.employee_leave_requests;
create policy "Employees can insert own leave"
  on public.employee_leave_requests for insert
  with check (
    auth.uid() = created_by
    and public.can_access_guardian_profile(employee_profile_id)
  );
