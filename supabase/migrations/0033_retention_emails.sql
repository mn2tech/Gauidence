-- Retention / getting-started emails (welcome + re-engagement nudges).

create table if not exists public.user_retention_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email_key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, email_key)
);

create index if not exists user_retention_emails_user_idx
  on public.user_retention_emails (user_id);

alter table public.user_retention_emails enable row level security;

create policy "Users can view own retention emails"
  on public.user_retention_emails for select
  using (auth.uid() = user_id);

comment on table public.user_retention_emails is
  'Idempotent log of welcome and re-engagement emails. Inserts via service role.';

alter table public.profiles
  add column if not exists email_tips_enabled boolean not null default true;

comment on column public.profiles.email_tips_enabled is
  'Getting-started and tips emails (welcome, setup nudges). Separate from deadline reminders.';
