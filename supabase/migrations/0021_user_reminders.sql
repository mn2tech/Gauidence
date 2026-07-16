-- User-created reminders (Ask Gideon / Attention), not tied to a document.
-- Safe to re-run.
-- Run in the Supabase SQL Editor.

-- Allow alerts without a document (personal reminders).
alter table public.alerts
  alter column document_id drop not null;

alter table public.alerts
  add column if not exists due_at timestamptz;

comment on column public.alerts.due_at is
  'Optional clock time for user reminders. Document deadlines may leave this null and use due_date only.';

-- Keep legacy rows valid; new user reminders use source = user and null document_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'alerts_document_or_user_chk'
  ) then
    alter table public.alerts
      add constraint alerts_document_or_user_chk check (
        (source = 'document' and document_id is not null)
        or (source = 'user' and document_id is null)
        or (source is distinct from 'document' and source is distinct from 'user')
      );
  end if;
end $$;

create index if not exists alerts_profile_due_at_idx
  on public.alerts (profile_id, due_at)
  where dismissed_at is null and due_at is not null;
