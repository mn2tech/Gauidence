-- My World foundation (Sprint 1)
-- Reuses semantic_* as the World store. Adds inbox + timeline only.
-- Rollback:
--   drop table if exists public.world_timeline_entries;
--   drop table if exists public.world_inbox_items;
--   alter table public.semantic_entities
--     drop column if exists importance_score,
--     drop column if exists status,
--     drop column if exists merged_into_id;

-- ---------------------------------------------------------------------------
-- semantic_entities: lifecycle + importance (non-destructive merges)
-- ---------------------------------------------------------------------------
alter table public.semantic_entities
  add column if not exists importance_score numeric;

alter table public.semantic_entities
  add column if not exists status text not null default 'active';

alter table public.semantic_entities
  add column if not exists merged_into_id uuid
    references public.semantic_entities (id) on delete set null;

do $$ begin
  alter table public.semantic_entities
    add constraint semantic_entities_status_chk
    check (status in ('active', 'merged', 'rejected', 'candidate'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.semantic_entities
    add constraint semantic_entities_importance_chk
    check (
      importance_score is null
      or (importance_score >= 0 and importance_score <= 1)
    );
exception when duplicate_object then null;
end $$;

create index if not exists semantic_entities_user_status_idx
  on public.semantic_entities (user_id, status);

create index if not exists semantic_entities_merged_into_idx
  on public.semantic_entities (merged_into_id)
  where merged_into_id is not null;

comment on column public.semantic_entities.status is
  'World entity lifecycle: active | merged | rejected | candidate. Never silent-delete on ambiguous identity.';

comment on column public.semantic_entities.merged_into_id is
  'When status=merged, points at the surviving canonical entity.';

comment on column public.semantic_entities.importance_score is
  '0..1 importance for My World ranking; null until World Engine scores.';

-- ---------------------------------------------------------------------------
-- world_inbox_items — identity / fact confirmations (consumer: World Inbox)
-- ---------------------------------------------------------------------------
create table if not exists public.world_inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  space_id uuid references public.guardian_profiles (id) on delete set null,

  type text not null,
  status text not null default 'pending',
  confidence numeric,

  -- Related semantic entities (candidate and/or suggested merge target)
  semantic_entity_id uuid references public.semantic_entities (id) on delete set null,
  related_entity_ids uuid[] not null default '{}',

  candidate jsonb not null default '{}'::jsonb,
  reason text,
  dedupe_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,

  constraint world_inbox_items_type_chk check (
    type in (
      'ENTITY_CONFIRMATION',
      'ENTITY_MERGE',
      'RELATIONSHIP_CONFIRMATION',
      'TRACKING_SUGGESTION',
      'AMBIGUOUS_FACT'
    )
  ),
  constraint world_inbox_items_status_chk check (
    status in (
      'pending',
      'confirmed',
      'edited',
      'merged',
      'rejected',
      'ignored'
    )
  ),
  constraint world_inbox_items_confidence_chk check (
    confidence is null
    or (confidence >= 0 and confidence <= 1)
  )
);

comment on table public.world_inbox_items is
  'My World Inbox: medium-confidence identity/relationship/fact confirmations. User corrections become high-confidence knowledge.';

create unique index if not exists world_inbox_items_pending_dedupe_uidx
  on public.world_inbox_items (user_id, dedupe_key)
  where status = 'pending';

create index if not exists world_inbox_items_user_status_idx
  on public.world_inbox_items (user_id, status, created_at desc);

create index if not exists world_inbox_items_space_idx
  on public.world_inbox_items (space_id)
  where space_id is not null;

create or replace function public.world_inbox_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists world_inbox_items_set_updated_at on public.world_inbox_items;
create trigger world_inbox_items_set_updated_at
  before update on public.world_inbox_items
  for each row execute function public.world_inbox_set_updated_at();

alter table public.world_inbox_items enable row level security;

drop policy if exists "Users can view own world inbox" on public.world_inbox_items;
create policy "Users can view own world inbox"
  on public.world_inbox_items for select
  using (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_access_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can create own world inbox" on public.world_inbox_items;
create policy "Users can create own world inbox"
  on public.world_inbox_items for insert
  with check (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_edit_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can update own world inbox" on public.world_inbox_items;
create policy "Users can update own world inbox"
  on public.world_inbox_items for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_edit_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can delete own world inbox" on public.world_inbox_items;
create policy "Users can delete own world inbox"
  on public.world_inbox_items for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- world_timeline_entries — important moments (not a second History dump)
-- ---------------------------------------------------------------------------
create table if not exists public.world_timeline_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  space_id uuid references public.guardian_profiles (id) on delete set null,

  entry_type text not null,
  title text not null,
  summary text,

  occurred_at timestamptz not null default now(),
  importance_score numeric not null default 0.5,
  confidence numeric,

  primary_entity_id uuid references public.semantic_entities (id) on delete set null,
  related_entity_ids uuid[] not null default '{}',

  source_type text not null,
  source_id text not null,
  guardian_event_id uuid references public.guardian_events (id) on delete set null,
  evidence_id uuid references public.semantic_evidence (id) on delete set null,

  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint world_timeline_entries_title_len_chk check (
    char_length(title) >= 1 and char_length(title) <= 300
  ),
  constraint world_timeline_entries_summary_len_chk check (
    summary is null or char_length(summary) <= 2000
  ),
  constraint world_timeline_entries_importance_chk check (
    importance_score >= 0 and importance_score <= 1
  ),
  constraint world_timeline_entries_confidence_chk check (
    confidence is null
    or (confidence >= 0 and confidence <= 1)
  )
);

comment on table public.world_timeline_entries is
  'My World timeline: high-signal moments linked to world entities. Complements guardian_events; avoids noise.';

create unique index if not exists world_timeline_entries_dedupe_uidx
  on public.world_timeline_entries (user_id, dedupe_key);

create index if not exists world_timeline_entries_user_occurred_idx
  on public.world_timeline_entries (user_id, occurred_at desc);

create index if not exists world_timeline_entries_space_idx
  on public.world_timeline_entries (space_id, occurred_at desc)
  where space_id is not null;

create index if not exists world_timeline_entries_entity_idx
  on public.world_timeline_entries (primary_entity_id)
  where primary_entity_id is not null;

create or replace function public.world_timeline_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists world_timeline_entries_set_updated_at on public.world_timeline_entries;
create trigger world_timeline_entries_set_updated_at
  before update on public.world_timeline_entries
  for each row execute function public.world_timeline_set_updated_at();

alter table public.world_timeline_entries enable row level security;

drop policy if exists "Users can view own world timeline" on public.world_timeline_entries;
create policy "Users can view own world timeline"
  on public.world_timeline_entries for select
  using (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_access_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can create own world timeline" on public.world_timeline_entries;
create policy "Users can create own world timeline"
  on public.world_timeline_entries for insert
  with check (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_edit_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can update own world timeline" on public.world_timeline_entries;
create policy "Users can update own world timeline"
  on public.world_timeline_entries for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_edit_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can delete own world timeline" on public.world_timeline_entries;
create policy "Users can delete own world timeline"
  on public.world_timeline_entries for delete
  using (auth.uid() = user_id);
