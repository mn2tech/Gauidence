-- Activation funnel + product analytics for Free → Pro conversion.
-- Non-destructive: existing users keep completed onboarding and are not re-gated.

alter table public.profiles
  add column if not exists onboarding_step text,
  add column if not exists first_value_reached_at timestamptz,
  add column if not exists trial_started_at timestamptz;

comment on column public.profiles.onboarding_step is
  'Activation step: welcome | create_space | add_knowledge | first_value | ask_gideon | completed.';

comment on column public.profiles.first_value_reached_at is
  'When the user first saw Guardian extract useful knowledge from their Space.';

comment on column public.profiles.trial_started_at is
  'Optional trial start timestamp for paid plans.';

alter table public.profiles
  drop constraint if exists profiles_onboarding_step_check;

alter table public.profiles
  add constraint profiles_onboarding_step_check
  check (
    onboarding_step is null
    or onboarding_step in (
      'welcome',
      'create_space',
      'add_knowledge',
      'first_value',
      'ask_gideon',
      'completed'
    )
  );

-- Allow organization as a first-run intent (maps to nonprofit Space).
alter table public.profiles
  drop constraint if exists profiles_onboarding_intent_check;

alter table public.profiles
  add constraint profiles_onboarding_intent_check
  check (
    onboarding_intent is null
    or onboarding_intent in (
      'personal',
      'family',
      'business',
      'school',
      'organization',
      'other'
    )
  );

-- Existing accounts: mark activation complete so they are not re-gated.
update public.profiles
set
  onboarding_step = coalesce(onboarding_step, 'completed'),
  onboarding_completed_at = coalesce(onboarding_completed_at, now())
where onboarding_completed_at is not null
   or onboarding_skipped = true;

update public.profiles
set onboarding_step = coalesce(onboarding_step, 'welcome')
where onboarding_completed_at is null
  and onboarding_skipped = false;

-- Lightweight funnel events (PostHog optional; this is the durable source of truth).
create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_name_created_idx
  on public.product_events (event_name, created_at desc);

create index if not exists product_events_user_created_idx
  on public.product_events (user_id, created_at desc);

alter table public.product_events enable row level security;

drop policy if exists "Users insert own product events" on public.product_events;
create policy "Users insert own product events"
  on public.product_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users read own product events" on public.product_events;
create policy "Users read own product events"
  on public.product_events
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.product_events is
  'Activation and subscription funnel events for admin metrics and future analytics export.';
