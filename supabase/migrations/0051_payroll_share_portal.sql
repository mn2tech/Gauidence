-- Guardian Business: payroll reports, time entries, secure external sharing.
-- Scoped to business vaults via profile_id + guardian_profile_members RLS helpers.

-- ---------------------------------------------------------------------------
-- payroll_employees (maps linked employee vaults to payroll IDs)
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  employee_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  payroll_employee_id text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, employee_profile_id)
);

create index if not exists payroll_employees_profile_idx
  on public.payroll_employees (profile_id);

-- ---------------------------------------------------------------------------
-- payroll_time_entries (clock in / clock out)
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  employee_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  notes text,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_time_entries_profile_period_idx
  on public.payroll_time_entries (profile_id, clock_in_at desc);

create index if not exists payroll_time_entries_employee_idx
  on public.payroll_time_entries (employee_profile_id, clock_in_at desc);

-- ---------------------------------------------------------------------------
-- payroll_reports
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  pay_period_start date not null,
  pay_period_end date not null,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'shared', 'processed', 'revoked')),
  total_regular_hours numeric(10,2) not null default 0,
  total_overtime_hours numeric(10,2) not null default 0,
  total_hours numeric(10,2) not null default 0,
  report_version integer not null default 1,
  previous_report_id uuid references public.payroll_reports (id) on delete set null,
  correction_reason text,
  created_by uuid not null references auth.users (id) on delete cascade,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_reports_period_order check (pay_period_end >= pay_period_start)
);

create index if not exists payroll_reports_profile_idx
  on public.payroll_reports (profile_id, pay_period_start desc);

create unique index if not exists payroll_reports_profile_period_version_unique
  on public.payroll_reports (profile_id, pay_period_start, pay_period_end, report_version);

-- ---------------------------------------------------------------------------
-- payroll_report_entries (immutable snapshot on approval)
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_report_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_report_id uuid not null references public.payroll_reports (id) on delete cascade,
  employee_profile_id uuid references public.guardian_profiles (id) on delete set null,
  employee_name text not null,
  payroll_employee_id text,
  regular_hours numeric(10,2) not null default 0,
  overtime_hours numeric(10,2) not null default 0,
  total_hours numeric(10,2) not null default 0,
  adjustment_hours numeric(10,2) not null default 0,
  adjustment_reason text,
  owner_notes text,
  missing_clock_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_report_entries_report_idx
  on public.payroll_report_entries (payroll_report_id);

-- ---------------------------------------------------------------------------
-- payroll_shares
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_shares (
  id uuid primary key default gen_random_uuid(),
  payroll_report_id uuid not null references public.payroll_reports (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  recipient_email text not null,
  recipient_email_normalized text not null,
  recipient_name text,
  access_token_hash text not null unique,
  access_type text not null default 'view_and_download'
    check (access_type in ('view_only', 'view_and_download')),
  allowed_formats text[] not null default '{csv,excel,pdf}',
  require_email_verification boolean not null default true,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  download_count integer not null default 0,
  opened_at timestamptz,
  optional_message text
);

create index if not exists payroll_shares_report_idx
  on public.payroll_shares (payroll_report_id, created_at desc);

create index if not exists payroll_shares_email_idx
  on public.payroll_shares (recipient_email_normalized);

-- ---------------------------------------------------------------------------
-- payroll_share_access_logs
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_share_access_logs (
  id uuid primary key default gen_random_uuid(),
  payroll_share_id uuid references public.payroll_shares (id) on delete cascade,
  payroll_report_id uuid references public.payroll_reports (id) on delete cascade,
  action text not null
    check (action in (
      'link_opened', 'code_requested', 'verified', 'report_viewed',
      'csv_downloaded', 'excel_downloaded', 'pdf_downloaded',
      'access_denied', 'revoked', 'email_sent', 'report_created',
      'report_approved', 'report_shared', 'report_corrected'
    )),
  recipient_email text,
  actor_user_id uuid references auth.users (id) on delete set null,
  ip_address text,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payroll_share_access_logs_share_idx
  on public.payroll_share_access_logs (payroll_share_id, created_at desc);

create index if not exists payroll_share_access_logs_report_idx
  on public.payroll_share_access_logs (payroll_report_id, created_at desc);

-- ---------------------------------------------------------------------------
-- payroll_verification_codes
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_verification_codes (
  id uuid primary key default gen_random_uuid(),
  payroll_share_id uuid not null references public.payroll_shares (id) on delete cascade,
  recipient_email text not null,
  recipient_email_normalized text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists payroll_verification_codes_share_idx
  on public.payroll_verification_codes (payroll_share_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_access_payroll_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_guardian_profile(p_profile_id);
$$;

create or replace function public.can_edit_payroll_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_guardian_profile(p_profile_id);
$$;

create or replace function public.can_manage_payroll_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_guardian_profile(p_profile_id);
$$;

create or replace function public.can_access_payroll_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.payroll_reports r
    where r.id = p_report_id
      and public.can_access_payroll_profile(r.profile_id)
  );
$$;

create or replace function public.can_edit_payroll_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.payroll_reports r
    where r.id = p_report_id
      and public.can_edit_payroll_profile(r.profile_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
alter table public.payroll_employees enable row level security;
alter table public.payroll_time_entries enable row level security;
alter table public.payroll_reports enable row level security;
alter table public.payroll_report_entries enable row level security;
alter table public.payroll_shares enable row level security;
alter table public.payroll_share_access_logs enable row level security;
alter table public.payroll_verification_codes enable row level security;

-- payroll_employees
drop policy if exists "Payroll profile members can view employees" on public.payroll_employees;
create policy "Payroll profile members can view employees"
  on public.payroll_employees for select
  using (public.can_access_payroll_profile(profile_id));

drop policy if exists "Payroll editors can manage employees" on public.payroll_employees;
create policy "Payroll editors can manage employees"
  on public.payroll_employees for all
  using (public.can_edit_payroll_profile(profile_id))
  with check (public.can_edit_payroll_profile(profile_id));

-- payroll_time_entries
drop policy if exists "Payroll profile members can view time entries" on public.payroll_time_entries;
create policy "Payroll profile members can view time entries"
  on public.payroll_time_entries for select
  using (public.can_access_payroll_profile(profile_id));

drop policy if exists "Payroll editors can manage time entries" on public.payroll_time_entries;
create policy "Payroll editors can manage time entries"
  on public.payroll_time_entries for all
  using (public.can_edit_payroll_profile(profile_id))
  with check (public.can_edit_payroll_profile(profile_id));

-- payroll_reports
drop policy if exists "Payroll profile members can view reports" on public.payroll_reports;
create policy "Payroll profile members can view reports"
  on public.payroll_reports for select
  using (public.can_access_payroll_profile(profile_id));

drop policy if exists "Payroll editors can create reports" on public.payroll_reports;
create policy "Payroll editors can create reports"
  on public.payroll_reports for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_payroll_profile(profile_id)
  );

drop policy if exists "Payroll editors can update reports" on public.payroll_reports;
create policy "Payroll editors can update reports"
  on public.payroll_reports for update
  using (public.can_edit_payroll_profile(profile_id))
  with check (public.can_edit_payroll_profile(profile_id));

-- payroll_report_entries
drop policy if exists "Payroll report viewers can view entries" on public.payroll_report_entries;
create policy "Payroll report viewers can view entries"
  on public.payroll_report_entries for select
  using (public.can_access_payroll_report(payroll_report_id));

drop policy if exists "Payroll editors can manage report entries" on public.payroll_report_entries;
create policy "Payroll editors can manage report entries"
  on public.payroll_report_entries for all
  using (public.can_edit_payroll_report(payroll_report_id))
  with check (public.can_edit_payroll_report(payroll_report_id));

-- payroll_shares
drop policy if exists "Payroll editors can view shares" on public.payroll_shares;
create policy "Payroll editors can view shares"
  on public.payroll_shares for select
  using (public.can_edit_payroll_profile(profile_id));

drop policy if exists "Payroll editors can create shares" on public.payroll_shares;
create policy "Payroll editors can create shares"
  on public.payroll_shares for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_payroll_profile(profile_id)
  );

drop policy if exists "Payroll editors can update shares" on public.payroll_shares;
create policy "Payroll editors can update shares"
  on public.payroll_shares for update
  using (public.can_edit_payroll_profile(profile_id))
  with check (public.can_edit_payroll_profile(profile_id));

-- payroll_share_access_logs
drop policy if exists "Payroll editors can view access logs" on public.payroll_share_access_logs;
create policy "Payroll editors can view access logs"
  on public.payroll_share_access_logs for select
  using (
    (payroll_report_id is not null and public.can_edit_payroll_report(payroll_report_id))
    or exists (
      select 1 from public.payroll_shares s
      where s.id = payroll_share_id
        and public.can_edit_payroll_profile(s.profile_id)
    )
  );

drop policy if exists "Payroll editors can insert access logs" on public.payroll_share_access_logs;
create policy "Payroll editors can insert access logs"
  on public.payroll_share_access_logs for insert
  with check (
    (payroll_report_id is not null and public.can_edit_payroll_report(payroll_report_id))
    or exists (
      select 1 from public.payroll_shares s
      where s.id = payroll_share_id
        and public.can_edit_payroll_profile(s.profile_id)
    )
  );

-- payroll_verification_codes: no direct client access (admin API only)
drop policy if exists "No direct access to verification codes" on public.payroll_verification_codes;
create policy "No direct access to verification codes"
  on public.payroll_verification_codes for all
  using (false)
  with check (false);

comment on table public.payroll_reports is
  'Payroll reports for business vaults. Draft reports are internal only; approved reports can be shared externally.';

comment on column public.payroll_shares.access_token_hash is
  'SHA-256 hash of the external access token. Raw tokens are never stored.';
