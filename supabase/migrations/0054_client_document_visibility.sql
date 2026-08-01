-- Client / viewer document visibility: owners and editors see all documents;
-- viewers (invited collaborators) only see rows with client_visible = true.

alter table public.documents
  add column if not exists client_visible boolean not null default false;

create index if not exists documents_profile_client_visible_idx
  on public.documents (profile_id, client_visible);

comment on column public.documents.client_visible is
  'When false, viewer-role collaborators cannot read this document or its files. Owners and editors always see all vault documents.';

-- Editors/owners see everything; viewers only client-visible rows.
create or replace function public.can_view_vault_document_row(
  p_profile_id uuid,
  p_client_visible boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_guardian_profile(p_profile_id)
    or (
      public.can_access_guardian_profile(p_profile_id)
      and coalesce(p_client_visible, false)
    );
$$;

revoke all on function public.can_view_vault_document_row(uuid, boolean) from public;
grant execute on function public.can_view_vault_document_row(uuid, boolean) to authenticated;

-- documents
drop policy if exists "Members can view vault documents" on public.documents;

create policy "Members can view vault documents"
  on public.documents for select
  using (
    public.can_view_vault_document_row(profile_id, client_visible)
  );

-- extracted_data
drop policy if exists "Members can view vault extracted data" on public.extracted_data;

create policy "Members can view vault extracted data"
  on public.extracted_data for select
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_id
        and public.can_view_vault_document_row(d.profile_id, d.client_visible)
    )
  );

-- alerts
drop policy if exists "Members can view vault alerts" on public.alerts;

create policy "Members can view vault alerts"
  on public.alerts for select
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_id
        and public.can_view_vault_document_row(d.profile_id, d.client_visible)
    )
  );

-- document_chunks
drop policy if exists "Members can view vault document chunks" on public.document_chunks;

create policy "Members can view vault document chunks"
  on public.document_chunks for select
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_id
        and public.can_view_vault_document_row(d.profile_id, d.client_visible)
    )
  );

-- daily_logs: internal notes — viewers cannot read
drop policy if exists "Members can view vault daily logs" on public.daily_logs;

create policy "Editors can view vault daily logs"
  on public.daily_logs for select
  using (public.can_edit_guardian_profile(profile_id));

-- storage: viewers can download only client-visible files
drop policy if exists "Members can view vault documents" on storage.objects;

create policy "Members can view vault documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.documents d
        where d.file_path = name
          and public.can_view_vault_document_row(d.profile_id, d.client_visible)
      )
    )
  );

-- Gideon multi-vault search respects visibility
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
  inner join public.documents d on d.id = c.document_id
  where filter_profile_ids is not null
    and c.profile_id = any(filter_profile_ids)
    and public.can_view_vault_document_row(c.profile_id, d.client_visible)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_document_chunks_multi(vector(1536), int, uuid[]) to authenticated;
