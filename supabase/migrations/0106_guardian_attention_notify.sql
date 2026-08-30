-- Stamp when Guardian emailed/pushed a Needs Attention digest for this item.
-- Prevents daily cron from notifying the same item repeatedly.
-- Rollback: alter table public.guardian_items drop column if exists attention_notified_at;

alter table public.guardian_items
  add column if not exists attention_notified_at timestamptz;

comment on column public.guardian_items.attention_notified_at is
  'When Guardian last sent a Needs Attention email/push for this item (null = never notified).';

create index if not exists guardian_items_attention_notify_idx
  on public.guardian_items (user_id, status)
  where attention_notified_at is null and status = 'active';
