-- Guardian Events (History / temporal intelligence layer)
-- Non-destructive parallel to daily_logs. Spaces remain guardian_profiles.
-- Distinct from guardian_action_events (AI action audit trail).
-- Rollback:
--   drop table if exists public.guardian_events;

create table if not exists public.guardian_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Nullable: events may exist before context classification.
  -- When set, Space = guardian_profiles (permission boundary).
  space_id uuid references public.guardian_profiles (id) on delete set null,

  event_type text not null,
  title text not null,
  summary text,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  source_type text not null default 'manual',
  source_id uuid,
  -- Idempotency key within (user_id, source_type, source_id) for backfills.
  dedupe_key text,

  importance_score numeric not null default 0.5,
  action_required boolean not null default false,
  status text not null default 'open',

  metadata jsonb not null default '{}'::jsonb,
  created_by text not null default 'user',
  confidence_score numeric,

  constraint guardian_events_event_type_chk check (
    event_type in (
      'note',
      'meeting',
      'document_added',
      'email',
      'decision',
      'task_created',
      'task_completed',
      'reminder',
      'deadline',
      'observation',
      'guardian_insight',
      'relationship_change',
      'follow_up',
      'daily_log_entry'
    )
  ),
  constraint guardian_events_status_chk check (
    status in ('open', 'completed', 'dismissed', 'cancelled')
  ),
  constraint guardian_events_created_by_chk check (
    created_by in ('user', 'system', 'gideon', 'backfill', 'watch')
  ),
  constraint guardian_events_title_len_chk check (
    char_length(title) >= 1 and char_length(title) <= 300
  ),
  constraint guardian_events_summary_len_chk check (
    summary is null or char_length(summary) <= 8000
  ),
  constraint guardian_events_importance_chk check (
    importance_score >= 0 and importance_score <= 1
  ),
  constraint guardian_events_confidence_chk check (
    confidence_score is null
    or (confidence_score >= 0 and confidence_score <= 1)
  ),
  constraint guardian_events_source_type_chk check (
    char_length(source_type) >= 1 and char_length(source_type) <= 64
  )
);

comment on table public.guardian_events is
  'History / temporal events. Parallel to daily_logs; never replaces original evidence. Space = guardian_profiles when classified.';

comment on column public.guardian_events.space_id is
  'Optional Space (guardian_profiles.id). Null when context confidence is low or not yet classified.';

comment on column public.guardian_events.source_type is
  'Provenance kind: daily_log | document | email | manual | guardian_item | etc.';

comment on column public.guardian_events.source_id is
  'Original evidence id (e.g. daily_logs.id). Never overwrite source rows.';

comment on column public.guardian_events.dedupe_key is
  'Idempotent backfill/create key scoped with user_id + source_type + source_id.';

create unique index if not exists guardian_events_source_dedupe_uidx
  on public.guardian_events (user_id, source_type, source_id, dedupe_key)
  where source_id is not null and dedupe_key is not null;

create index if not exists guardian_events_user_occurred_idx
  on public.guardian_events (user_id, occurred_at desc);

create index if not exists guardian_events_space_occurred_idx
  on public.guardian_events (space_id, occurred_at desc)
  where space_id is not null;

create index if not exists guardian_events_user_status_action_idx
  on public.guardian_events (user_id, status, action_required)
  where action_required = true;

create index if not exists guardian_events_event_type_idx
  on public.guardian_events (user_id, event_type);

create index if not exists guardian_events_source_lookup_idx
  on public.guardian_events (source_type, source_id)
  where source_id is not null;

create or replace function public.set_guardian_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guardian_events_set_updated_at on public.guardian_events;
create trigger guardian_events_set_updated_at
  before update on public.guardian_events
  for each row
  execute function public.set_guardian_events_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- Unscoped (space_id is null): owner only (user_id = auth.uid()).
-- Spaced: membership via can_access / can_edit / can_manage.
-- ---------------------------------------------------------------------------
alter table public.guardian_events enable row level security;

drop policy if exists "Users can view own or accessible guardian events"
  on public.guardian_events;
create policy "Users can view own or accessible guardian events"
  on public.guardian_events for select
  using (
    (
      space_id is null
      and auth.uid() = user_id
    )
    or (
      space_id is not null
      and public.can_access_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can insert own guardian events"
  on public.guardian_events;
create policy "Users can insert own guardian events"
  on public.guardian_events for insert
  with check (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_edit_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can update own or editable guardian events"
  on public.guardian_events;
create policy "Users can update own or editable guardian events"
  on public.guardian_events for update
  using (
    (
      space_id is null
      and auth.uid() = user_id
    )
    or (
      space_id is not null
      and public.can_edit_guardian_profile(space_id)
    )
  )
  with check (
    auth.uid() = user_id
    and (
      space_id is null
      or public.can_edit_guardian_profile(space_id)
    )
  );

drop policy if exists "Users can delete own or managed guardian events"
  on public.guardian_events;
create policy "Users can delete own or managed guardian events"
  on public.guardian_events for delete
  using (
    (
      space_id is null
      and auth.uid() = user_id
    )
    or (
      space_id is not null
      and public.can_manage_guardian_profile(space_id)
    )
  );
