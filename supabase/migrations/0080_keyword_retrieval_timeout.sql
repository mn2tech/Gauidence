-- Speed up hybrid keyword vault retrieval (was timing out on large source_text).
-- Rollback:
--   recreate from 0064_guardian_knowledge_retrieval_phase1.sql

create index if not exists document_chunks_document_id_chunk_idx
  on public.document_chunks (document_id, chunk_index);

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
-- Keep keyword search bounded so Ask Gideon can fall back to vector results.
set statement_timeout = '4s'
as $$
  with params as (
    select
      trim(coalesce(search_query, '')) as q,
      least(greatest(coalesce(match_count, 20), 1), 40) as lim
  ),
  tsq as (
    select
      p.q,
      p.lim,
      plainto_tsquery('english', p.q) as ts_query
    from params p
    where length(p.q) >= 2
  ),
  -- Content FTS on chunks (GIN index). Cap before union.
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
    order by keyword_score desc
    limit (select lim * 3 from tsq)
  ),
  -- Filename trigram matches (one row per matching chunk is fine; usually few).
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
    order by keyword_score desc
    limit (select lim * 2 from tsq)
  ),
  -- Search extracted_data once (not every chunk). Prefer title/summary; source_text last.
  extracted_hits as (
    select
      e.document_id,
      e.profile_id,
      greatest(
        ts_rank(to_tsvector('english', coalesce(e.title, '')), t.ts_query),
        ts_rank(to_tsvector('english', coalesce(e.summary, '')), t.ts_query),
        case
          when coalesce(e.source_text, '') <> ''
            and to_tsvector('english', e.source_text) @@ t.ts_query
          then ts_rank(
            to_tsvector('english', left(e.source_text, 20000)),
            t.ts_query
          )
          else 0::float
        end
      )::float as keyword_score,
      case
        when to_tsvector('english', coalesce(e.title, '')) @@ t.ts_query then 'title'
        when to_tsvector('english', coalesce(e.summary, '')) @@ t.ts_query then 'summary'
        else 'source_text'
      end as match_source
    from public.extracted_data e
    inner join public.documents d on d.id = e.document_id
    cross join tsq t
    where filter_profile_ids is not null
      and e.profile_id = any(filter_profile_ids)
      and public.can_view_vault_document_row(e.profile_id, d.client_visible)
      and (
        to_tsvector('english', coalesce(e.title, '')) @@ t.ts_query
        or to_tsvector('english', coalesce(e.summary, '')) @@ t.ts_query
        or (
          coalesce(e.source_text, '') <> ''
          and to_tsvector('english', e.source_text) @@ t.ts_query
        )
      )
    order by keyword_score desc
    limit (select lim * 2 from tsq)
  ),
  -- Attach a single representative chunk per matched document.
  extracted_fts as (
    select
      c.id,
      h.document_id,
      h.profile_id,
      c.file_name,
      c.content,
      c.chunk_index,
      h.keyword_score,
      h.match_source
    from extracted_hits h
    inner join lateral (
      select c0.*
      from public.document_chunks c0
      where c0.document_id = h.document_id
      order by c0.chunk_index asc
      limit 1
    ) c on true
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

comment on function public.search_document_chunks_keyword(text, uuid[], int) is
  'Hybrid keyword retrieval: chunk FTS + filename trigram + extracted title/summary/source_text (one chunk per doc). Bounded timeout.';
