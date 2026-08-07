-- Optional street address on vault profiles (homes, clients, etc.) for driving directions.

alter table public.guardian_profiles
  add column if not exists location_address text;

comment on column public.guardian_profiles.location_address is
  'Optional mailing or site address used for map directions.';
