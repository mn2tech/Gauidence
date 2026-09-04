-- Artifact identity metadata on vault documents (Guardian grounding).
-- documents.id remains the artifact_id; these columns store classification.

alter table public.documents
  add column if not exists artifact_source_type text,
  add column if not exists content_hash text,
  add column if not exists sensitivity text,
  add column if not exists thread_id uuid,
  add column if not exists parent_artifact_id uuid references public.documents (id) on delete set null;

comment on column public.documents.artifact_source_type is
  'email | email_thread | document | image | screenshot | note | pasted_text | spreadsheet | web_page | calendar_event';
comment on column public.documents.content_hash is
  'sha256 prefix of normalized content for artifact identity / dedupe';
comment on column public.documents.sensitivity is
  'none | low | medium | high — used by retrieval guards for isolation';
comment on column public.documents.thread_id is
  'optional thread grouping for email_thread / related artifacts';
comment on column public.documents.parent_artifact_id is
  'parent artifact when this is an attachment or derived extract';

create index if not exists documents_artifact_source_type_idx
  on public.documents (profile_id, artifact_source_type)
  where artifact_source_type is not null;

create index if not exists documents_content_hash_idx
  on public.documents (profile_id, content_hash)
  where content_hash is not null;
