-- Guardian Knowledge Retrieval Phase 1
-- 1. HNSW vector index for cosine similarity on document_chunks.embedding
-- 2. Async indexing job table
-- 3. Keyword / full-text search RPC for hybrid retrieval
--
-- Rollback (manual):
--   drop function if exists public.search_document_chunks_keyword(text, uuid[], int);
--   drop table if exists public.document_index_jobs;
--   drop type if exists public.document_index_status;
--   drop index if exists public.document_chunks_embedding_hnsw_idx;
--   drop index if exists public.document_chunks_content_fts_idx;
--   drop index if exists public.document_chunks_file_name_trgm_idx;
--   drop index if exists public.extracted_data_source_text_fts_idx;

-- ---------------------------------------------------------------------------
-- HNSW index for approximate nearest-neighbor cosine search
-- Existing RPCs (match_document_chunks, match_document_chunks_multi) use
-- cosine distance via the <=> operator; vector_cosine_ops is the matching
-- operator class. Expected improvement: sub-100ms ANN queries on large vaults
-- vs full sequential scans that grow linearly with chunk count.
-- ---------------------------------------------------------------------------
create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

comment on index public.document_chunks_embedding_hnsw_idx is
  'HNSW ANN index for cosine-distance vault RAG (Guardian Knowledge Retrieval Phase 1).';

-- ---------------------------------------------------------------------------
-- Full-text and trigram indexes for hybrid keyword retrieval
-- ---------------------------------------------------------------------------
create index if not exists document_chunks_content_fts_idx
  on public.document_chunks
  using gin (to_tsvector('english', content));

create index if not exists document_chunks_file_name_trgm_idx
  on public.document_chunks using gin (file_name gin_trgm_ops);

create index if not exists extracted_data_source_text_fts_idx
  on public.extracted_data
  using gin (to_tsvector('english', coalesce(source_text, '')));

-- ---------------------------------------------------------------------------
-- Async document indexing job queue (database-backed, no external queue)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_index_status') then
    create type public.document_index_status as enum (
      'pending',
      'processing',
      'completed',
      'failed',
      'stale'
    );
  end if;
end $$;

create table if not exists public.document_index_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  profile_id uuid not null references public.guardian_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.document_index_status not null default 'pending',
  reason text,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint document_index_jobs_document_id_key unique (document_id)
);

create index if not exists document_index_jobs_status_idx
  on public.document_index_jobs (status, created_at);

create index if not exists document_index_jobs_profile_id_idx
  on public.document_index_jobs (profile_id);

alter table public.document_index_jobs enable row level security;

drop policy if exists "Users manage own document index jobs" on public.document_index_jobs;
create policy "Users manage own document index jobs"
  on public.document_index_jobs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Keyword / full-text chunk search for hybrid retrieval
-- Respects vault permissions via can_view_vault_document_row.
-- ---------------------------------------------------------------------------
create or replace function public.search_document_chunks_keyword(
  search_query text,
  filter_profile_ids uuid[] default null,
  match_count int default 20
)
returns table (
  id uuid,
  document_id uuid,
  profile_id uuid,
  file_name text,
  content text,
  chunk_index int,
  keyword_score float,
  match_source text
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      trim(coalesce(search_query, '')) as q,
      greatest(coalesce(match_count, 20), 1) as lim
  ),
  tsq as (
    select
      p.q,
      p.lim,
      plainto_tsquery('english', p.q) as ts_query
    from params p
    where length(p.q) >= 2
  ),
  chunk_fts as (
    select
      c.id,
      c.document_id,
      c.profile_id,
      c.file_name,
      c.content,
      c.chunk_index,
      ts_rank(to_tsvector('english', c.content), t.ts_query)::float as keyword_score,
      'chunk_content'::text as match_source
    from public.document_chunks c
    inner join public.documents d on d.id = c.document_id
    cross join tsq t
    where filter_profile_ids is not null
      and c.profile_id = any(filter_profile_ids)
      and public.can_view_vault_document_row(c.profile_id, d.client_visible)
      and to_tsvector('english', c.content) @@ t.ts_query
  ),
  file_name_trgm as (
    select
      c.id,
      c.document_id,
      c.profile_id,
      c.file_name,
      c.content,
      c.chunk_index,
      similarity(c.file_name, t.q)::float as keyword_score,
      'file_name'::text as match_source
    from public.document_chunks c
    inner join public.documents d on d.id = c.document_id
    cross join tsq t
    where filter_profile_ids is not null
      and c.profile_id = any(filter_profile_ids)
      and public.can_view_vault_document_row(c.profile_id, d.client_visible)
      and c.file_name % t.q
  ),
  extracted_fts as (
    select
      c.id,
      c.document_id,
      c.profile_id,
      c.file_name,
      c.content,
      c.chunk_index,
      greatest(
        ts_rank(to_tsvector('english', coalesce(e.title, '')), t.ts_query),
        ts_rank(to_tsvector('english', coalesce(e.summary, '')), t.ts_query),
        ts_rank(to_tsvector('english', coalesce(e.source_text, '')), t.ts_query)
      )::float as keyword_score,
      case
        when to_tsvector('english', coalesce(e.title, '')) @@ t.ts_query then 'title'
        when to_tsvector('english', coalesce(e.summary, '')) @@ t.ts_query then 'summary'
        else 'source_text'
      end as match_source
    from public.document_chunks c
    inner join public.documents d on d.id = c.document_id
    inner join public.extracted_data e on e.document_id = c.document_id
    cross join tsq t
    where filter_profile_ids is not null
      and c.profile_id = any(filter_profile_ids)
      and public.can_view_vault_document_row(c.profile_id, d.client_visible)
      and (
        to_tsvector('english', coalesce(e.title, '')) @@ t.ts_query
        or to_tsvector('english', coalesce(e.summary, '')) @@ t.ts_query
        or to_tsvector('english', coalesce(e.source_text, '')) @@ t.ts_query
      )
  ),
  combined as (
    select * from chunk_fts
    union all
    select * from file_name_trgm
    union all
    select * from extracted_fts
  ),
  best_per_chunk as (
    select distinct on (c.id)
      c.id,
      c.document_id,
      c.profile_id,
      c.file_name,
      c.content,
      c.chunk_index,
      c.keyword_score,
      c.match_source
    from combined c
    order by c.id, c.keyword_score desc
  )
  select
    b.id,
    b.document_id,
    b.profile_id,
    b.file_name,
    b.content,
    b.chunk_index,
    b.keyword_score,
    b.match_source
  from best_per_chunk b
  order by b.keyword_score desc
  limit (select lim from tsq);
$$;

grant execute on function public.search_document_chunks_keyword(text, uuid[], int) to authenticated;
