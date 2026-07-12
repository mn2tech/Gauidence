-- Ask-your-document chat: one thread per document, messages cascade with the chat/document.
-- Run in the Supabase SQL Editor.

create table if not exists public.document_chats (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_chats_user_id_idx
  on public.document_chats (user_id, updated_at desc);

alter table public.document_chats enable row level security;

create policy "Users can view own document chats"
  on public.document_chats for select
  using (auth.uid() = user_id);

create policy "Users can insert own document chats"
  on public.document_chats for insert
  with check (auth.uid() = user_id);

create policy "Users can update own document chats"
  on public.document_chats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own document chats"
  on public.document_chats for delete
  using (auth.uid() = user_id);

create table if not exists public.document_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.document_chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists document_chat_messages_chat_created_idx
  on public.document_chat_messages (chat_id, created_at asc);

alter table public.document_chat_messages enable row level security;

create policy "Users can view own chat messages"
  on public.document_chat_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own chat messages"
  on public.document_chat_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own chat messages"
  on public.document_chat_messages for delete
  using (auth.uid() = user_id);

-- Separate hourly rate limit for chat (does not share analysis_events quota).
create table if not exists public.chat_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists chat_events_user_created_idx
  on public.chat_events (user_id, created_at desc);

alter table public.chat_events enable row level security;

create policy "Users can view own chat events"
  on public.chat_events for select
  using (auth.uid() = user_id);

create policy "Users can insert own chat events"
  on public.chat_events for insert
  with check (auth.uid() = user_id);
