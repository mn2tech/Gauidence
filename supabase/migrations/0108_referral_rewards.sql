-- Referral attribution + reward ledger (1 month Pro credit when invitee pays).
-- Rollback:
--   drop table if exists public.referral_rewards;
--   alter table public.profiles
--     drop column if exists signup_ref,
--     drop column if exists referred_by_user_id;

alter table public.profiles
  add column if not exists signup_ref text,
  add column if not exists referred_by_user_id uuid references public.profiles (id) on delete set null;

create index if not exists profiles_referred_by_user_id_idx
  on public.profiles (referred_by_user_id)
  where referred_by_user_id is not null;

comment on column public.profiles.signup_ref is
  'Raw ?ref= from signup (8-char user code or campaign slug). Set once.';
comment on column public.profiles.referred_by_user_id is
  'Resolved referrer profile when signup_ref matched a user referral code.';

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.profiles (id) on delete cascade,
  invitee_user_id uuid not null references public.profiles (id) on delete cascade,
  signup_ref text,
  status text not null
    check (status in ('granted', 'skipped')),
  skip_reason text,
  amount_cents integer not null default 0,
  stripe_balance_transaction_id text,
  granted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (invitee_user_id)
);

create index if not exists referral_rewards_referrer_created_idx
  on public.referral_rewards (referrer_user_id, created_at desc);

create index if not exists referral_rewards_referrer_granted_idx
  on public.referral_rewards (referrer_user_id, granted_at desc)
  where status = 'granted';

alter table public.referral_rewards enable row level security;

create policy "Users can view own referral rewards"
  on public.referral_rewards for select
  using (auth.uid() = referrer_user_id);

comment on table public.referral_rewards is
  'One row per invitee. Granted = Stripe customer balance credit to referrer. Inserts via service role.';
