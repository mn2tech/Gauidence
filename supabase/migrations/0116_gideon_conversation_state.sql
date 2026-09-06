-- Gideon Conversation Runtime v1 — persistent working state per Ask Gideon thread.
-- Scoped to the owning user via user_id + RLS; never shared across users.
-- Rollback:
--   drop table if exists public.gideon_conversation_state;

create table if not exists public.gideon_conversation_state (
  conversation_id uuid primary key references public.vault_chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  active_goal text,
  active_entities jsonb not null default '[]'::jsonb,
  active_space_ids jsonb not null default '[]'::jsonb,
  recent_evidence jsonb not null default '[]'::jsonb,
  conversation_summary text,
  pending_actions jsonb not null default '[]'::jsonb,
  last_intent text,
  last_user_message text,
  last_assistant_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gideon_conversation_state_user_updated_idx
  on public.gideon_conversation_state (user_id, updated_at desc);

create index if not exists gideon_conversation_state_user_conversation_idx
  on public.gideon_conversation_state (user_id, conversation_id);

comment on table public.gideon_conversation_state is
  'Ask Gideon conversation working state (entities, goal, summary). Private per user.';

comment on column public.gideon_conversation_state.active_entities is
  'JSONB array of ActiveEntity objects for conversational continuity.';

comment on column public.gideon_conversation_state.recent_evidence is
  'JSONB array of lightweight evidence references (not full documents).';

comment on column public.gideon_conversation_state.pending_actions is
  'JSONB placeholder actions suggested during conversation (Sprint 1: state only).';

alter table public.gideon_conversation_state enable row level security;

drop policy if exists "Users can view own gideon conversation state"
  on public.gideon_conversation_state;
create policy "Users can view own gideon conversation state"
  on public.gideon_conversation_state for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own gideon conversation state"
  on public.gideon_conversation_state;
create policy "Users can insert own gideon conversation state"
  on public.gideon_conversation_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own gideon conversation state"
  on public.gideon_conversation_state;
create policy "Users can update own gideon conversation state"
  on public.gideon_conversation_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own gideon conversation state"
  on public.gideon_conversation_state;
create policy "Users can delete own gideon conversation state"
  on public.gideon_conversation_state for delete
  using (auth.uid() = user_id);
