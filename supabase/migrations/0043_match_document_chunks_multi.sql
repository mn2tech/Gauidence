-- Multi-vault vector retrieval: search all accessible guardian profiles in one round-trip.

create or replace function public.match_document_chunks_multi(
  query_embedding vector(1536),
  match_count int default 8,
  filter_profile_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  profile_id uuid,
  file_name text,
  content text,
  chunk_index int,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.profile_id,
    c.file_name,
    c.content,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.document_chunks c
  where filter_profile_ids is not null
    and c.profile_id = any(filter_profile_ids)
    and public.can_access_guardian_profile(c.profile_id)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_document_chunks_multi(vector(1536), int, uuid[]) to authenticated;
