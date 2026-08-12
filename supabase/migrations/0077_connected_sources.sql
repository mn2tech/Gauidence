-- Guardian Phone Storage Connection v1: connected_sources + source_items.
-- Account-scoped external connectors (phone storage first).
-- Rollback:
--   drop table if exists public.source_items;
--   drop table if exists public.connected_sources;
--   drop function if exists public.connected_sources_set_updated_at();
--   drop function if exists public.source_items_set_updated_at();

-- ---------------------------------------------------------------------------
-- connected_sources
-- ---------------------------------------------------------------------------
create table if not exists public.connected_sources (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  -- Optional space scope (guardian_profiles). Phone storage is typically account-scoped.
  profile_id uuid null references public.guardian_profiles (id) on delete set null,

  source_type text not null
    check (source_type in ('android_storage', 'guardian')),

  display_name text,

  -- Original folder URI / handle key (never invent a fake filesystem path).
  source_uri text,

  status text not null default 'connected'
    check (status in (
      'connected',
      'disconnected',
      'error',
      'permission_revoked'
    )),

  settings jsonb not null default '{}'::jsonb,

  last_scan_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists connected_sources_user_idx
  on public.connected_sources (user_id, updated_at desc);

create index if not exists connected_sources_user_type_idx
  on public.connected_sources (user_id, source_type, status);

create index if not exists connected_sources_profile_idx
  on public.connected_sources (profile_id)
  where profile_id is not null;

comment on table public.connected_sources is
  'External data connectors (phone storage, future Drive/M365, etc.).';
comment on column public.connected_sources.source_uri is
  'Original content URI or persisted handle key; do not rewrite to fake paths.';
comment on column public.connected_sources.settings is
  'Connector-specific settings (folder display name, platform, etc.).';

-- ---------------------------------------------------------------------------
-- source_items
-- ---------------------------------------------------------------------------
create table if not exists public.source_items (
  id uuid primary key default gen_random_uuid(),

  source_id uuid not null
    references public.connected_sources (id) on delete cascade,

  external_id text not null,

  name text not null,

  mime_type text,

  source_uri text,

  size_bytes bigint,

  modified_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,

  processing_status text not null default 'discovered'
    check (processing_status in (
      'discovered',
      'unavailable'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_id, external_id)
);

create index if not exists source_items_source_idx
  on public.source_items (source_id, processing_status);

create index if not exists source_items_source_name_idx
  on public.source_items (source_id, lower(name));

create index if not exists source_items_modified_idx
  on public.source_items (source_id, modified_at desc nulls last);

comment on table public.source_items is
  'Metadata-only catalog of files discovered by a connected source. No file contents.';
comment on column public.source_items.external_id is
  'Stable id within the source (e.g. document URI). Used for idempotent upserts.';
comment on column public.source_items.processing_status is
  'discovered | unavailable. Future: analyzed, etc. without coupling to ontology.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.connected_sources_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists connected_sources_set_updated_at on public.connected_sources;
create trigger connected_sources_set_updated_at
  before update on public.connected_sources
  for each row execute function public.connected_sources_set_updated_at();

create or replace function public.source_items_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists source_items_set_updated_at on public.source_items;
create trigger source_items_set_updated_at
  before update on public.source_items
  for each row execute function public.source_items_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — account ownership (auth.uid() = user_id)
-- Child rows gated via parent ownership EXISTS.
-- ---------------------------------------------------------------------------
alter table public.connected_sources enable row level security;
alter table public.source_items enable row level security;

drop policy if exists "Users can view own connected sources" on public.connected_sources;
create policy "Users can view own connected sources"
  on public.connected_sources for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own connected sources" on public.connected_sources;
create policy "Users can create own connected sources"
  on public.connected_sources for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own connected sources" on public.connected_sources;
create policy "Users can update own connected sources"
  on public.connected_sources for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own connected sources" on public.connected_sources;
create policy "Users can delete own connected sources"
  on public.connected_sources for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can view own source items" on public.source_items;
create policy "Users can view own source items"
  on public.source_items for select
  using (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create own source items" on public.source_items;
create policy "Users can create own source items"
  on public.source_items for insert
  with check (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own source items" on public.source_items;
create policy "Users can update own source items"
  on public.source_items for update
  using (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own source items" on public.source_items;
create policy "Users can delete own source items"
  on public.source_items for delete
  using (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.user_id = auth.uid()
    )
  );
