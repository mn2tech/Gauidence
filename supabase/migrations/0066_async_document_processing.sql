-- Async document processing pipeline: separate upload from analysis, indexing, and knowledge extraction.
-- Rollback:
--   drop table if exists public.document_processing_jobs;
--   alter table public.documents drop column if exists indexing_status;
--   alter table public.documents drop column if exists knowledge_status;
--   alter table public.documents drop column if exists processing_step;
--   alter table public.documents drop column if exists processing_progress;
--   alter table public.documents drop column if exists last_processing_error;
--   alter table public.documents drop column if exists processing_started_at;
--   alter table public.documents drop column if exists processing_completed_at;
--   alter table public.documents drop column if exists processing_diagnostics;

-- ---------------------------------------------------------------------------
-- Extended document processing state (analysis_status remains for compat)
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists indexing_status text not null default 'pending',
  add column if not exists knowledge_status text not null default 'pending',
  add column if not exists processing_step text,
  add column if not exists processing_progress smallint,
  add column if not exists last_processing_error text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_completed_at timestamptz,
  add column if not exists processing_diagnostics jsonb;

comment on column public.documents.indexing_status is
  'Vault RAG indexing: pending | processing | completed | failed | retryable | skipped';
comment on column public.documents.knowledge_status is
  'Knowledge graph extraction: pending | processing | completed | failed | retryable | skipped';

-- Backfill indexing_status for documents that already have chunks.
update public.documents d
set indexing_status = 'completed'
where indexing_status = 'pending'
  and exists (
    select 1 from public.document_chunks c where c.document_id = d.id
  );

-- Backfill knowledge_status for completed extraction jobs.
update public.documents d
set knowledge_status = 'completed'
where knowledge_status = 'pending'
  and exists (
    select 1
    from public.guardian_knowledge_extraction_jobs j
    where j.document_id = d.id
      and j.status = 'completed'
  );

-- Mark searchable documents as processing-complete.
update public.documents
set processing_completed_at = coalesce(processing_completed_at, created_at)
where analysis_status in ('completed', 'needs_verification')
  and indexing_status = 'completed'
  and processing_completed_at is null;

-- ---------------------------------------------------------------------------
-- Job queue: analyze_document → index_document → extract_knowledge
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.document_processing_job_type as enum (
    'analyze_document',
    'index_document',
    'extract_knowledge'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_processing_job_status as enum (
    'pending',
    'processing',
    'completed',
    'failed',
    'retryable'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  job_type public.document_processing_job_type not null,
  pipeline_version text not null default 'v1',
  status public.document_processing_job_status not null default 'pending',
  attempts int not null default 0,
  max_attempts int not null default 3,
  next_retry_at timestamptz,
  last_error text,
  error_category text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  diagnostics jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_processing_jobs_unique
    unique (document_id, job_type, pipeline_version)
);

create index if not exists document_processing_jobs_status_idx
  on public.document_processing_jobs (status, created_at);

create index if not exists document_processing_jobs_user_id_idx
  on public.document_processing_jobs (user_id, status, created_at);

alter table public.document_processing_jobs enable row level security;

drop policy if exists "Users manage own document processing jobs" on public.document_processing_jobs;
create policy "Users manage own document processing jobs"
  on public.document_processing_jobs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
