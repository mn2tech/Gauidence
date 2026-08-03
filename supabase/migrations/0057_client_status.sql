-- Active vs inactive client vaults under a business / nonprofit org.

alter table public.guardian_profiles
  add column if not exists client_status text;

update public.guardian_profiles
set client_status = 'active'
where profile_type = 'client'
  and client_status is null;

alter table public.guardian_profiles
  drop constraint if exists guardian_profiles_client_status_check;

alter table public.guardian_profiles
  add constraint guardian_profiles_client_status_check
  check (client_status is null or client_status in ('active', 'inactive'));

comment on column public.guardian_profiles.client_status is
  'For profile_type = client: active (current) or inactive (did not work out). Null for non-client profiles.';

create index if not exists guardian_profiles_parent_client_status_idx
  on public.guardian_profiles (parent_profile_id, client_status)
  where profile_type = 'client';
