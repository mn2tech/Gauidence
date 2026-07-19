-- LLM token usage for platform admin reporting.
-- Inserts go through the service-role client only (no authenticated policies).
-- Run in the Supabase SQL Editor after deploying the app.

create table if not exists public.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  provider text not null default 'anthropic',
  model text not null default '',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_events_created_idx
  on public.llm_usage_events (created_at desc);

create index if not exists llm_usage_events_user_created_idx
  on public.llm_usage_events (user_id, created_at desc);

create index if not exists llm_usage_events_feature_created_idx
  on public.llm_usage_events (feature, created_at desc);

alter table public.llm_usage_events enable row level security;

comment on table public.llm_usage_events is
  'Claude (and related) token usage per request. Readable only via service role for ADMIN_EMAILS.';
