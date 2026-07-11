-- AI analysis results + deadline alerts.
-- Both cascade-delete with their document, keeping the safe-deletion promise.
-- Run in the Supabase SQL Editor.

create table if not exists public.extracted_data (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  summary text,
  facts jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

alter table public.extracted_data enable row level security;

create policy "Users can view own extracted data"
  on public.extracted_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own extracted data"
  on public.extracted_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own extracted data"
  on public.extracted_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own extracted data"
  on public.extracted_data for delete
  using (auth.uid() = user_id);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  due_date date not null,
  source text not null default 'document',
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists alerts_user_due_idx on public.alerts (user_id, due_date);

alter table public.alerts enable row level security;

create policy "Users can view own alerts"
  on public.alerts for select
  using (auth.uid() = user_id);

create policy "Users can insert own alerts"
  on public.alerts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own alerts"
  on public.alerts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own alerts"
  on public.alerts for delete
  using (auth.uid() = user_id);
