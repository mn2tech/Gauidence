-- Allow Google Drive as a connected source type.
-- Rollback:
--   alter table public.connected_sources drop constraint if exists connected_sources_source_type_check;
--   alter table public.connected_sources
--     add constraint connected_sources_source_type_check
--     check (source_type in ('android_storage', 'guardian', 'trello'));

alter table public.connected_sources
  drop constraint if exists connected_sources_source_type_check;

alter table public.connected_sources
  add constraint connected_sources_source_type_check
  check (source_type in ('android_storage', 'guardian', 'trello', 'google_drive'));

comment on column public.connected_sources.settings is
  'Connector-specific settings. Trello: apiKey + token. Google Drive: OAuth tokens (server-only; redact in API responses) plus selected folder/drive and bound space.';
