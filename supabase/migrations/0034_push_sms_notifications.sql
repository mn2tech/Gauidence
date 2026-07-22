-- Push subscriptions, SMS opt-in, and award notification tracking.

alter table public.profiles
  add column if not exists phone_e164 text,
  add column if not exists sms_notifications_enabled boolean not null default false,
  add column if not exists push_notifications_enabled boolean not null default true;

alter table public.user_awards
  add column if not exists notify_sent_at timestamptz;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "Users can view own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can delete own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

create policy "Users can insert own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

comment on column public.profiles.phone_e164 is
  'E.164 mobile number for optional SMS alerts (awards, urgent deadlines).';
comment on column public.profiles.sms_notifications_enabled is
  'Opt-in SMS for awards and day-before deadline reminders.';
comment on table public.push_subscriptions is
  'Web Push endpoints per browser. Inserts via API (service role).';
