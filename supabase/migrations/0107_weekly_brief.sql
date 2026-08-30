-- Weekly Guardian Brief email preferences + last-send stamp.
-- Rollback:
--   alter table public.profiles
--     drop column if exists weekly_brief_enabled,
--     drop column if exists weekly_brief_sent_at;

alter table public.profiles
  add column if not exists weekly_brief_enabled boolean not null default true,
  add column if not exists weekly_brief_sent_at timestamptz;

comment on column public.profiles.weekly_brief_enabled is
  'When true, Guardian may email a Weekly Brief (coming up + what changed).';
comment on column public.profiles.weekly_brief_sent_at is
  'When the last Weekly Brief email was sent (null = never).';
