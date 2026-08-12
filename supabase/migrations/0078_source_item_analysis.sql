-- Connector → ontology: extend source_items processing lifecycle.
-- Rollback:
--   alter table public.source_items drop column if exists analysis_error;
--   alter table public.source_items drop column if exists analyzed_at;
--   alter table public.source_items drop column if exists analysis_version;
--   alter table public.source_items drop column if exists content_hash;
--   -- restore prior processing_status check manually if needed

alter table public.source_items
  drop constraint if exists source_items_processing_status_check;

alter table public.source_items
  add constraint source_items_processing_status_check
  check (processing_status in (
    'discovered',
    'analyzing',
    'analyzed',
    'analysis_failed',
    'unavailable'
  ));

alter table public.source_items
  add column if not exists analysis_error text;

alter table public.source_items
  add column if not exists analyzed_at timestamptz;

alter table public.source_items
  add column if not exists analysis_version text;

alter table public.source_items
  add column if not exists content_hash text;

comment on column public.source_items.processing_status is
  'discovered | analyzing | analyzed | analysis_failed | unavailable';
comment on column public.source_items.content_hash is
  'Hash of bytes last analyzed; used for idempotent re-analysis.';
comment on column public.source_items.analysis_error is
  'Safe user-facing error summary when analysis_failed.';
