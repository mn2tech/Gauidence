-- Guardian Recruit: job requisitions, candidate pipeline, scoring, reviews, reports.
-- Scoped to business vaults via profile_id + guardian_profile_members RLS helpers.

-- ---------------------------------------------------------------------------
-- recruitment_jobs
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  department text,
  hiring_manager text,
  job_description text not null default '',
  required_skills text[] not null default '{}',
  preferred_skills text[] not null default '{}',
  min_years_experience numeric(4,1),
  required_education text,
  required_certifications text[] not null default '{}',
  location text,
  work_mode text check (work_mode in ('remote', 'hybrid', 'onsite')),
  employment_type text,
  work_authorization_requirement text,
  salary_range text,
  shortlist_count integer not null default 5 check (shortlist_count >= 1 and shortlist_count <= 50),
  status text not null default 'draft'
    check (status in ('draft', 'uploading', 'configuring', 'analyzing', 'reviewing', 'shortlisted', 'archived')),
  current_step text not null default 'create_job'
    check (current_step in ('create_job', 'upload_resumes', 'configure_criteria', 'analyze', 'review', 'shortlist', 'export')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_jobs_profile_idx
  on public.recruitment_jobs (profile_id, updated_at desc);

create index if not exists recruitment_jobs_owner_idx
  on public.recruitment_jobs (owner_user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- recruitment_job_requirements (rubric weights)
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_job_requirements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recruitment_jobs (id) on delete cascade unique,
  weight_required_skills integer not null default 30 check (weight_required_skills >= 0 and weight_required_skills <= 100),
  weight_relevant_experience integer not null default 25 check (weight_relevant_experience >= 0 and weight_relevant_experience <= 100),
  weight_domain_experience integer not null default 15 check (weight_domain_experience >= 0 and weight_domain_experience <= 100),
  weight_preferred_skills integer not null default 10 check (weight_preferred_skills >= 0 and weight_preferred_skills <= 100),
  weight_education_certifications integer not null default 10 check (weight_education_certifications >= 0 and weight_education_certifications <= 100),
  weight_career_stability integer not null default 5 check (weight_career_stability >= 0 and weight_career_stability <= 100),
  weight_location_availability integer not null default 5 check (weight_location_availability >= 0 and weight_location_availability <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_rubric_weights_sum check (
    weight_required_skills + weight_relevant_experience + weight_domain_experience
    + weight_preferred_skills + weight_education_certifications + weight_career_stability
    + weight_location_availability = 100
  )
);

-- ---------------------------------------------------------------------------
-- recruitment_job_shares (hiring manager access)
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_job_shares (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recruitment_jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'hiring_manager'
    check (role in ('hiring_manager', 'viewer')),
  shared_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (job_id, user_id)
);

create index if not exists recruitment_job_shares_user_idx
  on public.recruitment_job_shares (user_id);

-- ---------------------------------------------------------------------------
-- recruitment_candidates
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recruitment_jobs (id) on delete cascade,
  display_name text,
  email text,
  phone text,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'extracting', 'extracted', 'analyzing', 'analyzed', 'failed')),
  processing_error text,
  manual_rank integer,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'shortlisted', 'declined', 'hm_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_candidates_job_idx
  on public.recruitment_candidates (job_id, manual_rank nulls last);

create unique index if not exists recruitment_candidates_job_email_unique
  on public.recruitment_candidates (job_id, lower(email))
  where email is not null and email <> '';

-- ---------------------------------------------------------------------------
-- recruitment_candidate_files
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_candidate_files (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.recruitment_candidates (id) on delete cascade,
  job_id uuid not null references public.recruitment_jobs (id) on delete cascade,
  file_name text not null,
  file_path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  file_hash text not null,
  storage_bucket text not null default 'documents',
  created_at timestamptz not null default now()
);

create index if not exists recruitment_candidate_files_candidate_idx
  on public.recruitment_candidate_files (candidate_id);

create unique index if not exists recruitment_candidate_files_job_hash_unique
  on public.recruitment_candidate_files (job_id, file_hash);

-- ---------------------------------------------------------------------------
-- recruitment_candidate_extractions
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_candidate_extractions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.recruitment_candidates (id) on delete cascade unique,
  candidate_name text,
  email text,
  phone text,
  location text,
  current_title text,
  total_experience_years numeric(4,1),
  relevant_experience_years numeric(4,1),
  employment_history jsonb not null default '[]'::jsonb,
  technical_skills text[] not null default '{}',
  domain_experience text[] not null default '{}',
  education jsonb not null default '[]'::jsonb,
  certifications text[] not null default '{}',
  work_authorization text,
  availability text,
  raw_extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- recruitment_candidate_scores
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_candidate_scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.recruitment_candidates (id) on delete cascade unique,
  match_score numeric(5,2) not null default 0,
  overridden_score numeric(5,2),
  recommendation_status text not null default 'needs_review'
    check (recommendation_status in ('strong_match', 'possible_match', 'needs_review', 'not_recommended')),
  required_skill_match_pct numeric(5,2),
  matched_requirements text[] not null default '{}',
  missing_requirements text[] not null default '{}',
  preferred_qualifications_matched text[] not null default '{}',
  unclear_information text[] not null default '{}',
  interview_questions text[] not null default '{}',
  candidate_summary text,
  strengths text[] not null default '{}',
  concerns text[] not null default '{}',
  category_scores jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- recruitment_candidate_evidence
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_candidate_evidence (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.recruitment_candidates (id) on delete cascade,
  field_name text not null,
  field_value text,
  evidence_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_candidate_evidence_candidate_idx
  on public.recruitment_candidate_evidence (candidate_id);

-- ---------------------------------------------------------------------------
-- recruitment_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.recruitment_candidates (id) on delete cascade,
  reviewer_user_id uuid not null references auth.users (id) on delete cascade,
  recruiter_notes text,
  edited_summary text,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'shortlisted', 'declined', 'hm_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, reviewer_user_id)
);

-- ---------------------------------------------------------------------------
-- recruitment_shortlists
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_shortlists (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recruitment_jobs (id) on delete cascade,
  candidate_id uuid not null references public.recruitment_candidates (id) on delete cascade,
  rank integer not null,
  added_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);

create index if not exists recruitment_shortlists_job_rank_idx
  on public.recruitment_shortlists (job_id, rank);

-- ---------------------------------------------------------------------------
-- recruitment_reports
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recruitment_jobs (id) on delete cascade,
  generated_by uuid not null references auth.users (id) on delete cascade,
  report_data jsonb not null default '{}'::jsonb,
  email_draft text,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_reports_job_idx
  on public.recruitment_reports (job_id, created_at desc);

-- ---------------------------------------------------------------------------
-- recruitment_audit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.recruitment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recruitment_jobs (id) on delete cascade,
  candidate_id uuid references public.recruitment_candidates (id) on delete set null,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_audit_logs_job_idx
  on public.recruitment_audit_logs (job_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_access_recruitment_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recruitment_jobs j
    where j.id = target_job_id
      and (
        public.can_access_guardian_profile(j.profile_id)
        or exists (
          select 1
          from public.recruitment_job_shares s
          where s.job_id = j.id
            and s.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_edit_recruitment_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recruitment_jobs j
    where j.id = target_job_id
      and public.can_edit_guardian_profile(j.profile_id)
  );
$$;

grant execute on function public.can_access_recruitment_job(uuid) to authenticated;
grant execute on function public.can_edit_recruitment_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
alter table public.recruitment_jobs enable row level security;
alter table public.recruitment_job_requirements enable row level security;
alter table public.recruitment_job_shares enable row level security;
alter table public.recruitment_candidates enable row level security;
alter table public.recruitment_candidate_files enable row level security;
alter table public.recruitment_candidate_extractions enable row level security;
alter table public.recruitment_candidate_scores enable row level security;
alter table public.recruitment_candidate_evidence enable row level security;
alter table public.recruitment_reviews enable row level security;
alter table public.recruitment_shortlists enable row level security;
alter table public.recruitment_reports enable row level security;
alter table public.recruitment_audit_logs enable row level security;

-- recruitment_jobs
drop policy if exists "Users can view accessible recruitment jobs" on public.recruitment_jobs;
create policy "Users can view accessible recruitment jobs"
  on public.recruitment_jobs for select
  using (public.can_access_recruitment_job(id));

drop policy if exists "Users can insert recruitment jobs in editable vaults" on public.recruitment_jobs;
create policy "Users can insert recruitment jobs in editable vaults"
  on public.recruitment_jobs for insert
  with check (
    auth.uid() = owner_user_id
    and public.can_edit_guardian_profile(profile_id)
  );

drop policy if exists "Users can update editable recruitment jobs" on public.recruitment_jobs;
create policy "Users can update editable recruitment jobs"
  on public.recruitment_jobs for update
  using (public.can_edit_recruitment_job(id))
  with check (public.can_edit_recruitment_job(id));

drop policy if exists "Users can delete editable recruitment jobs" on public.recruitment_jobs;
create policy "Users can delete editable recruitment jobs"
  on public.recruitment_jobs for delete
  using (public.can_edit_recruitment_job(id));

-- recruitment_job_requirements
drop policy if exists "Users can view job requirements" on public.recruitment_job_requirements;
create policy "Users can view job requirements"
  on public.recruitment_job_requirements for select
  using (public.can_access_recruitment_job(job_id));

drop policy if exists "Users can manage job requirements" on public.recruitment_job_requirements;
create policy "Users can manage job requirements"
  on public.recruitment_job_requirements for all
  using (public.can_edit_recruitment_job(job_id))
  with check (public.can_edit_recruitment_job(job_id));

-- recruitment_job_shares
drop policy if exists "Users can view job shares" on public.recruitment_job_shares;
create policy "Users can view job shares"
  on public.recruitment_job_shares for select
  using (public.can_access_recruitment_job(job_id) or auth.uid() = user_id);

drop policy if exists "Users can manage job shares" on public.recruitment_job_shares;
create policy "Users can manage job shares"
  on public.recruitment_job_shares for all
  using (public.can_edit_recruitment_job(job_id))
  with check (public.can_edit_recruitment_job(job_id));

-- recruitment_candidates
drop policy if exists "Users can view candidates" on public.recruitment_candidates;
create policy "Users can view candidates"
  on public.recruitment_candidates for select
  using (public.can_access_recruitment_job(job_id));

drop policy if exists "Users can manage candidates" on public.recruitment_candidates;
create policy "Users can manage candidates"
  on public.recruitment_candidates for all
  using (public.can_edit_recruitment_job(job_id))
  with check (public.can_edit_recruitment_job(job_id));

-- recruitment_candidate_files
drop policy if exists "Users can view candidate files" on public.recruitment_candidate_files;
create policy "Users can view candidate files"
  on public.recruitment_candidate_files for select
  using (public.can_access_recruitment_job(job_id));

drop policy if exists "Users can manage candidate files" on public.recruitment_candidate_files;
create policy "Users can manage candidate files"
  on public.recruitment_candidate_files for all
  using (public.can_edit_recruitment_job(job_id))
  with check (public.can_edit_recruitment_job(job_id));

-- recruitment_candidate_extractions
drop policy if exists "Users can view extractions" on public.recruitment_candidate_extractions;
create policy "Users can view extractions"
  on public.recruitment_candidate_extractions for select
  using (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_access_recruitment_job(c.job_id)
    )
  );

drop policy if exists "Users can manage extractions" on public.recruitment_candidate_extractions;
create policy "Users can manage extractions"
  on public.recruitment_candidate_extractions for all
  using (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_edit_recruitment_job(c.job_id)
    )
  )
  with check (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_edit_recruitment_job(c.job_id)
    )
  );

-- recruitment_candidate_scores
drop policy if exists "Users can view scores" on public.recruitment_candidate_scores;
create policy "Users can view scores"
  on public.recruitment_candidate_scores for select
  using (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_access_recruitment_job(c.job_id)
    )
  );

drop policy if exists "Users can manage scores" on public.recruitment_candidate_scores;
create policy "Users can manage scores"
  on public.recruitment_candidate_scores for all
  using (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_edit_recruitment_job(c.job_id)
    )
  )
  with check (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_edit_recruitment_job(c.job_id)
    )
  );

-- recruitment_candidate_evidence
drop policy if exists "Users can view evidence" on public.recruitment_candidate_evidence;
create policy "Users can view evidence"
  on public.recruitment_candidate_evidence for select
  using (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_access_recruitment_job(c.job_id)
    )
  );

drop policy if exists "Users can manage evidence" on public.recruitment_candidate_evidence;
create policy "Users can manage evidence"
  on public.recruitment_candidate_evidence for all
  using (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_edit_recruitment_job(c.job_id)
    )
  )
  with check (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_edit_recruitment_job(c.job_id)
    )
  );

-- recruitment_reviews
drop policy if exists "Users can view reviews" on public.recruitment_reviews;
create policy "Users can view reviews"
  on public.recruitment_reviews for select
  using (
    exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_access_recruitment_job(c.job_id)
    )
  );

drop policy if exists "Users can manage own reviews" on public.recruitment_reviews;
create policy "Users can manage own reviews"
  on public.recruitment_reviews for all
  using (
    auth.uid() = reviewer_user_id
    and exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_edit_recruitment_job(c.job_id)
    )
  )
  with check (
    auth.uid() = reviewer_user_id
    and exists (
      select 1 from public.recruitment_candidates c
      where c.id = candidate_id and public.can_edit_recruitment_job(c.job_id)
    )
  );

-- recruitment_shortlists
drop policy if exists "Users can view shortlists" on public.recruitment_shortlists;
create policy "Users can view shortlists"
  on public.recruitment_shortlists for select
  using (public.can_access_recruitment_job(job_id));

drop policy if exists "Users can manage shortlists" on public.recruitment_shortlists;
create policy "Users can manage shortlists"
  on public.recruitment_shortlists for all
  using (public.can_edit_recruitment_job(job_id))
  with check (public.can_edit_recruitment_job(job_id));

-- recruitment_reports
drop policy if exists "Users can view reports" on public.recruitment_reports;
create policy "Users can view reports"
  on public.recruitment_reports for select
  using (public.can_access_recruitment_job(job_id));

drop policy if exists "Users can create reports" on public.recruitment_reports;
create policy "Users can create reports"
  on public.recruitment_reports for insert
  with check (
    auth.uid() = generated_by
    and public.can_edit_recruitment_job(job_id)
  );

-- recruitment_audit_logs
drop policy if exists "Users can view audit logs" on public.recruitment_audit_logs;
create policy "Users can view audit logs"
  on public.recruitment_audit_logs for select
  using (public.can_access_recruitment_job(job_id));

drop policy if exists "Users can insert audit logs" on public.recruitment_audit_logs;
create policy "Users can insert audit logs"
  on public.recruitment_audit_logs for insert
  with check (
    auth.uid() = actor_user_id
    and public.can_edit_recruitment_job(job_id)
  );

comment on table public.recruitment_jobs is
  'Guardian Recruit job requisitions scoped to business vaults.';
comment on table public.recruitment_candidates is
  'Applicants for a recruitment job; deduplicated by email and file hash per job.';
