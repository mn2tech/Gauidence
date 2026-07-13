-- Add non_profit as a guardian profile type.
-- Safe to re-run: drops and recreates the check constraint.

alter table public.guardian_profiles
  drop constraint if exists guardian_profiles_profile_type_check;

alter table public.guardian_profiles
  add constraint guardian_profiles_profile_type_check
  check (profile_type in (
    'personal',
    'child',
    'spouse_partner',
    'parent',
    'family_member',
    'student',
    'business',
    'non_profit',
    'employee',
    'client',
    'other'
  ));
