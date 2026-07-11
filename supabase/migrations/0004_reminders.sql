-- Email deadline reminders.
-- Adds a per-user opt-out and per-stage "already emailed" timestamps so the
-- daily cron never sends the same reminder twice.
-- Run in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists email_reminders_enabled boolean not null default true;

alter table public.alerts
  add column if not exists reminder_7d_sent_at timestamptz,
  add column if not exists reminder_1d_sent_at timestamptz;

-- The cron job queries by due date across all users with the service role,
-- which bypasses RLS; the existing (user_id, due_date) index still covers
-- per-user reads. Add a due-date index for the cron scan.
create index if not exists alerts_due_date_idx on public.alerts (due_date)
  where dismissed_at is null;
