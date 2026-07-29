-- Guardian Recruit: hiring manager email + secure in-app report links.

alter table public.recruitment_jobs
  add column if not exists hiring_manager_email text;

comment on column public.recruitment_jobs.hiring_manager_email is
  'Hiring manager email for report notifications and shared access.';

-- ---------------------------------------------------------------------------
-- recruitment_report_links (tokenized in-Guardian report access)
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_report_links (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recruitment_jobs (id) on delete cascade,
  report_id uuid references public.recruitment_reports (id) on delete set null,
  token text not null unique,
  invited_email text not null,
  invited_email_normalized text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_report_links_job_idx
  on public.recruitment_report_links (job_id, created_at desc);

create index if not exists recruitment_report_links_email_idx
  on public.recruitment_report_links (invited_email_normalized);

alter table public.recruitment_report_links enable row level security;

drop policy if exists "Recruiters can view report links" on public.recruitment_report_links;
create policy "Recruiters can view report links"
  on public.recruitment_report_links for select
  using (public.can_edit_recruitment_job(job_id));

drop policy if exists "Recruiters can create report links" on public.recruitment_report_links;
create policy "Recruiters can create report links"
  on public.recruitment_report_links for insert
  with check (
    auth.uid() = created_by
    and public.can_edit_recruitment_job(job_id)
  );

drop policy if exists "Recruiters can revoke report links" on public.recruitment_report_links;
create policy "Recruiters can revoke report links"
  on public.recruitment_report_links for update
  using (public.can_edit_recruitment_job(job_id))
  with check (public.can_edit_recruitment_job(job_id));
