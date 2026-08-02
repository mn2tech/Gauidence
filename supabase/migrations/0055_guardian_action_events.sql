-- Guardian Action Engine: auditable timeline of AI actions.

create table if not exists public.guardian_action_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid references public.guardian_profiles (id) on delete set null,
  chat_id uuid references public.vault_chats (id) on delete set null,
  action_id text not null,
  label text not null,
  phase text not null default 'detected'
    check (phase in ('detected', 'proposed', 'confirmed', 'executed', 'failed')),
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guardian_action_events_owner_created_idx
  on public.guardian_action_events (owner_user_id, created_at desc);

create index if not exists guardian_action_events_profile_created_idx
  on public.guardian_action_events (profile_id, created_at desc)
  where profile_id is not null;

alter table public.guardian_action_events enable row level security;

create policy "Users can view own guardian action events"
  on public.guardian_action_events for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert own guardian action events"
  on public.guardian_action_events for insert
  with check (auth.uid() = owner_user_id);
