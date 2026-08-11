-- Contractor / new-hire secure intake (SSN typing + document upload via token link).
-- Rollback:
--   drop table if exists public.contractor_intake_access_logs;
--   drop table if exists public.contractor_intake_verification_codes;
--   drop table if exists public.contractor_intake_submissions;
--   drop table if exists public.contractor_intake_requests;

-- ---------------------------------------------------------------------------
-- contractor_intake_requests
-- ---------------------------------------------------------------------------
create table if not exists public.contractor_intake_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  employee_profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  recipient_email text not null,
  recipient_email_normalized text not null,
  recipient_name text,
  purpose text not null default 'ssn_clearance'
    check (purpose in ('ssn_clearance', 'w9', 'onboarding')),
  access_token_hash text not null unique,
  require_email_verification boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending', 'opened', 'submitted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  optional_message text,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  submitted_at timestamptz,
  last_accessed_at timestamptz
);

create index if not exists contractor_intake_requests_profile_idx
  on public.contractor_intake_requests (profile_id, created_at desc);

create index if not exists contractor_intake_requests_employee_idx
  on public.contractor_intake_requests (employee_profile_id, created_at desc);

create index if not exists contractor_intake_requests_email_idx
  on public.contractor_intake_requests (recipient_email_normalized);

-- ---------------------------------------------------------------------------
-- contractor_intake_submissions
-- ---------------------------------------------------------------------------
create table if not exists public.contractor_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  intake_request_id uuid not null unique references public.contractor_intake_requests (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  submission_type text not null
    check (submission_type in ('typed_ssn', 'document_upload', 'both')),
  ssn_encrypted text,
  ssn_last_four text,
  document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint contractor_intake_submissions_ssn_check
    check (
      submission_type = 'document_upload'
      or ssn_encrypted is not null
    )
);

create index if not exists contractor_intake_submissions_request_idx
  on public.contractor_intake_submissions (intake_request_id);

-- ---------------------------------------------------------------------------
-- contractor_intake_access_logs
-- ---------------------------------------------------------------------------
create table if not exists public.contractor_intake_access_logs (
  id uuid primary key default gen_random_uuid(),
  intake_request_id uuid not null references public.contractor_intake_requests (id) on delete cascade,
  action text not null
    check (action in (
      'link_opened', 'code_requested', 'verified', 'submitted',
      'access_denied', 'revoked', 'email_sent', 'ssn_revealed'
    )),
  recipient_email text,
  actor_user_id uuid references auth.users (id) on delete set null,
  ip_address text,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contractor_intake_access_logs_request_idx
  on public.contractor_intake_access_logs (intake_request_id, created_at desc);

-- ---------------------------------------------------------------------------
-- contractor_intake_verification_codes
-- ---------------------------------------------------------------------------
create table if not exists public.contractor_intake_verification_codes (
  id uuid primary key default gen_random_uuid(),
  intake_request_id uuid not null references public.contractor_intake_requests (id) on delete cascade,
  recipient_email text not null,
  recipient_email_normalized text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists contractor_intake_verification_codes_request_idx
  on public.contractor_intake_verification_codes (intake_request_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.contractor_intake_requests enable row level security;
alter table public.contractor_intake_submissions enable row level security;
alter table public.contractor_intake_access_logs enable row level security;
alter table public.contractor_intake_verification_codes enable row level security;

-- Requests: business vault members can view; editors can manage
drop policy if exists "Members can view intake requests" on public.contractor_intake_requests;
create policy "Members can view intake requests"
  on public.contractor_intake_requests for select
  using (public.can_access_guardian_profile(profile_id));

drop policy if exists "Editors can create intake requests" on public.contractor_intake_requests;
create policy "Editors can create intake requests"
  on public.contractor_intake_requests for insert
  with check (
    public.can_edit_guardian_profile(profile_id)
    and created_by = auth.uid()
  );

drop policy if exists "Editors can update intake requests" on public.contractor_intake_requests;
create policy "Editors can update intake requests"
  on public.contractor_intake_requests for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

-- Submissions: editors on business profile only (not employee vault collaborators)
drop policy if exists "Editors can view intake submissions" on public.contractor_intake_submissions;
create policy "Editors can view intake submissions"
  on public.contractor_intake_submissions for select
  using (public.can_edit_guardian_profile(profile_id));

drop policy if exists "Editors can insert intake submissions" on public.contractor_intake_submissions;
create policy "Editors can insert intake submissions"
  on public.contractor_intake_submissions for insert
  with check (public.can_edit_guardian_profile(profile_id));

-- Access logs: editors can view
drop policy if exists "Editors can view intake access logs" on public.contractor_intake_access_logs;
create policy "Editors can view intake access logs"
  on public.contractor_intake_access_logs for select
  using (
    exists (
      select 1
      from public.contractor_intake_requests r
      where r.id = intake_request_id
        and public.can_edit_guardian_profile(r.profile_id)
    )
  );

-- Verification codes: service role only (no client policies)
