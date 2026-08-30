-- Due-soon notify stamps for timed reminders / Guardian items (hour-level).
-- Rollback:
--   alter table public.alerts drop column if exists due_soon_notified_at;
--   alter table public.guardian_items drop column if exists due_soon_notified_at;

alter table public.alerts
  add column if not exists due_soon_notified_at timestamptz;

alter table public.guardian_items
  add column if not exists due_soon_notified_at timestamptz;

create index if not exists alerts_due_soon_pending_idx
  on public.alerts (due_at)
  where dismissed_at is null
    and due_at is not null
    and due_soon_notified_at is null;

create index if not exists guardian_items_due_soon_pending_idx
  on public.guardian_items (due_at)
  where status = 'active'
    and due_at is not null
    and due_soon_notified_at is null;

comment on column public.alerts.due_soon_notified_at is
  'When email/push fired for an imminent timed reminder (due_at window).';
comment on column public.guardian_items.due_soon_notified_at is
  'When email/push fired for an imminent due_at on a Guardian item.';
