-- Guardian Items + Watch Engine
-- Space-scoped actionable memory (events, deadlines, reminders, etc.)
-- with provenance, dedupe, and cross-Space Watch aggregation.
-- Rollback:
--   drop table if exists public.guardian_items;
--   alter table public.documents drop column if exists guardian_items_status;
--   -- enum value extract_guardian_items cannot be removed safely once added

-- ---------------------------------------------------------------------------
-- Document processing status for guardian item extraction
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists guardian_items_status text not null default 'pending';

comment on column public.documents.guardian_items_status is
  'Guardian item extraction: pending | processing | completed | failed | retryable | skipped';

-- ---------------------------------------------------------------------------
-- Pipeline job type
-- ---------------------------------------------------------------------------
do $$ begin
  alter type public.document_processing_job_type add value 'extract_guardian_items';
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- guardian_items
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Space = guardian_profiles row
  space_id uuid not null references public.guardian_profiles (id) on delete cascade,
  child_id uuid references public.guardian_profiles (id) on delete set null,
  school_context_id uuid references public.parent_school_contexts (id) on delete set null,

  type text not null,
  title text not null,
  description text,

  event_date date,
  start_at timestamptz,
  end_at timestamptz,
  due_at timestamptz,
  remind_at timestamptz,

  status text not null default 'active',
  priority text not null default 'normal',

  requires_action boolean not null default false,
  action_label text,
  action_url text,

  source_type text not null default 'document',
  source_id uuid,
  source_document_id uuid references public.documents (id) on delete set null,
  source_excerpt text,
  source_page integer,

  confidence numeric,
  needs_review boolean not null default false,
  extraction_version text,

  dedupe_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  dismissed_at timestamptz,

  constraint guardian_items_type_chk check (
    type in (
      'event',
      'deadline',
      'reminder',
      'task',
      'payment',
      'renewal',
      'expiration',
      'appointment',
      'school_closure',
      'follow_up',
      'commitment',
      'return_window',
      'warranty',
      'birthday',
      'travel',
      'document_requirement',
      'informational'
    )
  ),
  constraint guardian_items_status_chk check (
    status in ('active', 'completed', 'dismissed', 'expired', 'cancelled')
  ),
  constraint guardian_items_priority_chk check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  constraint guardian_items_title_len_chk check (
    char_length(title) >= 1 and char_length(title) <= 300
  ),
  constraint guardian_items_excerpt_len_chk check (
    source_excerpt is null or char_length(source_excerpt) <= 800
  )
);

comment on table public.guardian_items is
  'Cross-Space Watch items: actionable or awareness events extracted or created manually. Space = guardian_profiles.';

create unique index if not exists guardian_items_space_dedupe_active_idx
  on public.guardian_items (space_id, dedupe_key)
  where status = 'active';

create index if not exists guardian_items_user_status_idx
  on public.guardian_items (user_id, status);

create index if not exists guardian_items_space_status_idx
  on public.guardian_items (space_id, status);

create index if not exists guardian_items_event_date_idx
  on public.guardian_items (event_date)
  where status = 'active' and event_date is not null;

create index if not exists guardian_items_due_at_idx
  on public.guardian_items (due_at)
  where status = 'active' and due_at is not null;

create index if not exists guardian_items_child_idx
  on public.guardian_items (child_id)
  where child_id is not null;

create index if not exists guardian_items_document_idx
  on public.guardian_items (source_document_id)
  where source_document_id is not null;

create or replace function public.set_guardian_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guardian_items_set_updated_at on public.guardian_items;
create trigger guardian_items_set_updated_at
  before update on public.guardian_items
  for each row
  execute function public.set_guardian_items_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.guardian_items enable row level security;

drop policy if exists "Members can view guardian items" on public.guardian_items;
create policy "Members can view guardian items"
  on public.guardian_items for select
  using (public.can_access_guardian_profile(space_id));

drop policy if exists "Editors can insert guardian items" on public.guardian_items;
create policy "Editors can insert guardian items"
  on public.guardian_items for insert
  with check (
    auth.uid() = user_id
    and public.can_edit_guardian_profile(space_id)
  );

drop policy if exists "Editors can update guardian items" on public.guardian_items;
create policy "Editors can update guardian items"
  on public.guardian_items for update
  using (public.can_edit_guardian_profile(space_id))
  with check (public.can_edit_guardian_profile(space_id));

drop policy if exists "Owners can delete guardian items" on public.guardian_items;
create policy "Owners can delete guardian items"
  on public.guardian_items for delete
  using (public.can_manage_guardian_profile(space_id));
