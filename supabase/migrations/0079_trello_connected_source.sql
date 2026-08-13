-- Allow Trello as a connected source type.
-- Rollback:
--   alter table public.connected_sources drop constraint if exists connected_sources_source_type_check;
--   alter table public.connected_sources
--     add constraint connected_sources_source_type_check
--     check (source_type in ('android_storage', 'guardian'));

alter table public.connected_sources
  drop constraint if exists connected_sources_source_type_check;

alter table public.connected_sources
  add constraint connected_sources_source_type_check
  check (source_type in ('android_storage', 'guardian', 'trello'));

comment on column public.connected_sources.settings is
  'Connector-specific settings. For Trello: apiKey + token (server-only; redact in API responses).';
