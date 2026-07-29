-- First-run intent capture: what brings the user to Guardian.
-- Soft-gate onboarding; personal vault still auto-created (0038).

alter table public.profiles
  add column if not exists onboarding_intent text,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_skipped boolean not null default false;

comment on column public.profiles.onboarding_intent is
  'First-run intent: personal | family | business | school | other.';

comment on column public.profiles.onboarding_completed_at is
  'When the user finished (or skipped) the intent screen.';

comment on column public.profiles.onboarding_skipped is
  'True when the user chose Just explore without picking an intent.';

alter table public.profiles
  drop constraint if exists profiles_onboarding_intent_check;

alter table public.profiles
  add constraint profiles_onboarding_intent_check
  check (
    onboarding_intent is null
    or onboarding_intent in ('personal', 'family', 'business', 'school', 'other')
  );

-- Do not force existing accounts through the new intent screen.
update public.profiles
set
  onboarding_completed_at = coalesce(onboarding_completed_at, now()),
  onboarding_skipped = true
where onboarding_completed_at is null;
