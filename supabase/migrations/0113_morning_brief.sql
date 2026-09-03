-- Daily Morning Brief (Gideon checks Spaces → email digest).
-- Rollback:
--   alter table public.profiles
--     drop column if exists morning_brief_enabled,
--     drop column if exists morning_brief_sent_on;

alter table public.profiles
  add column if not exists morning_brief_enabled boolean not null default true,
  add column if not exists morning_brief_sent_on date;

comment on column public.profiles.morning_brief_enabled is
  'When true, Guardian may email a daily Morning Brief (Today + Needs Attention across Spaces).';
comment on column public.profiles.morning_brief_sent_on is
  'Calendar date (user timezone) when the last Morning Brief was sent (null = never).';
