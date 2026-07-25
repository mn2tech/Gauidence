-- Per-account IANA timezone for dates, reminders, and Gideon "today".

alter table public.profiles
  add column if not exists time_zone text not null default 'America/New_York',
  add column if not exists time_zone_source text not null default 'default'
    check (time_zone_source in ('default', 'auto', 'manual'));

comment on column public.profiles.time_zone is
  'IANA timezone (e.g. Asia/Kolkata) for this account''s calendar and reminders.';
comment on column public.profiles.time_zone_source is
  'default = not customized; auto = detected from device; manual = user picked in settings.';
