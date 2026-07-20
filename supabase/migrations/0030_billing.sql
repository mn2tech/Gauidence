-- Billing: Free vs Personal plan on account profiles + chat feature tagging.
-- Run in the Supabase SQL Editor after deploy.

alter table public.profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'personal')),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text;

create unique index if not exists profiles_stripe_customer_id_uidx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_uidx
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Tag chat_events so Ask Gideon / doc chat vs Research can use separate monthly caps.
alter table public.chat_events
  add column if not exists feature text not null default 'chat'
    check (feature in ('chat', 'research'));

create index if not exists chat_events_user_feature_created_idx
  on public.chat_events (user_id, feature, created_at desc);
