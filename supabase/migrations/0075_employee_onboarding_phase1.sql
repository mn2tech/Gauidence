-- Phase 1 onboarding: employment kind + contact fields on employee profiles and intake.

alter table public.guardian_profiles
  add column if not exists employment_kind text
    check (employment_kind is null or employment_kind in ('employee', 'contractor'));

alter table public.guardian_profiles
  add column if not exists legal_name text;

alter table public.guardian_profiles
  add column if not exists contact_email text;

alter table public.guardian_profiles
  add column if not exists contact_phone text;

comment on column public.guardian_profiles.employment_kind is
  'For employee vaults: employee (W-2 path) or contractor (1099 path).';

comment on column public.guardian_profiles.legal_name is
  'Full legal name for HR/onboarding when different from display_name.';

comment on column public.guardian_profiles.contact_email is
  'Contact email for linked employees without a Guardian login.';

comment on column public.guardian_profiles.contact_phone is
  'Contact phone for linked employees.';

alter table public.contractor_intake_requests
  add column if not exists default_employment_kind text
    check (default_employment_kind is null or default_employment_kind in ('employee', 'contractor'));

alter table public.contractor_intake_submissions
  add column if not exists legal_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists location_address text,
  add column if not exists employment_kind text
    check (employment_kind is null or employment_kind in ('employee', 'contractor'));
