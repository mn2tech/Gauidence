-- Gmail connected source + inbox_messages for live Inbox sync.
-- Rollback:
--   drop table if exists public.inbox_messages;
--   alter table public.connected_sources drop constraint if exists connected_sources_source_type_check;
--   alter table public.connected_sources
--     add constraint connected_sources_source_type_check
--     check (source_type in ('android_storage', 'guardian', 'trello', 'google_drive'));

alter table public.connected_sources
  drop constraint if exists connected_sources_source_type_check;

alter table public.connected_sources
  add constraint connected_sources_source_type_check
  check (
    source_type in (
      'android_storage',
      'guardian',
      'trello',
      'google_drive',
      'gmail'
    )
  );

comment on column public.connected_sources.settings is
  'Connector-specific settings. Trello: apiKey + token. Google Drive / Gmail: OAuth tokens (server-only; redact in API responses). Drive also stores folder/drive. Gmail stores lastSyncAt / sync cursors.';

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references public.connected_sources (id) on delete cascade,
  external_id text not null,
  thread_external_id text,
  from_name text,
  from_email text,
  subject text not null default '',
  preview text not null default '',
  received_at timestamptz,
  needs_attention boolean not null default false,
  bucket text,
  assigned_space_id uuid references public.guardian_profiles (id) on delete set null,
  suggested_space_id uuid references public.guardian_profiles (id) on delete set null,
  label_ids text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create index if not exists inbox_messages_user_received_idx
  on public.inbox_messages (user_id, received_at desc nulls last);

create index if not exists inbox_messages_user_bucket_idx
  on public.inbox_messages (user_id, bucket)
  where bucket is not null;

create index if not exists inbox_messages_user_space_idx
  on public.inbox_messages (user_id, assigned_space_id, suggested_space_id);

comment on table public.inbox_messages is
  'Synced mailbox messages for Guardian Inbox (Gmail MVP). Owner-only via RLS.';

create or replace function public.inbox_messages_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inbox_messages_set_updated_at on public.inbox_messages;
create trigger inbox_messages_set_updated_at
  before update on public.inbox_messages
  for each row
  execute function public.inbox_messages_set_updated_at();

alter table public.inbox_messages enable row level security;

drop policy if exists "Users manage own inbox messages" on public.inbox_messages;
create policy "Users manage own inbox messages"
  on public.inbox_messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
