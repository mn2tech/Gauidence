-- Vault-wide RAG: chunk embeddings per user document + vault chat threads.
-- Requires the pgvector extension (available on Supabase by default).
-- Run in the Supabase SQL Editor.

create extension if not exists vector;

-- Embedding dimension for OpenAI text-embedding-3-small
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists document_chunks_user_id_idx
  on public.document_chunks (user_id);

create index if not exists document_chunks_document_id_idx
  on public.document_chunks (document_id);

-- Small per-user vaults: exact nearest-neighbor is fine without an ANN index.
-- Add an HNSW index later if vaults grow large:
--   create index document_chunks_embedding_idx
--     on public.document_chunks using hnsw (embedding vector_cosine_ops);

alter table public.document_chunks enable row level security;

create policy "Users can view own document chunks"
  on public.document_chunks for select
  using (auth.uid() = user_id);

create policy "Users can insert own document chunks"
  on public.document_chunks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own document chunks"
  on public.document_chunks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own document chunks"
  on public.document_chunks for delete
  using (auth.uid() = user_id);

-- Similarity search scoped to the calling user (RLS still applies).
create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  file_name text,
  content text,
  chunk_index int,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.file_name,
    c.content,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.document_chunks c
  where c.user_id = auth.uid()
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_document_chunks(vector(1536), int) to authenticated;

-- One vault-wide chat thread per user
create table if not exists public.vault_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vault_chats enable row level security;

create policy "Users can view own vault chat"
  on public.vault_chats for select
  using (auth.uid() = user_id);

create policy "Users can insert own vault chat"
  on public.vault_chats for insert
  with check (auth.uid() = user_id);

create policy "Users can update own vault chat"
  on public.vault_chats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own vault chat"
  on public.vault_chats for delete
  using (auth.uid() = user_id);

create table if not exists public.vault_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.vault_chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vault_chat_messages_chat_created_idx
  on public.vault_chat_messages (chat_id, created_at asc);

alter table public.vault_chat_messages enable row level security;

create policy "Users can view own vault chat messages"
  on public.vault_chat_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own vault chat messages"
  on public.vault_chat_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own vault chat messages"
  on public.vault_chat_messages for delete
  using (auth.uid() = user_id);

-- Reuse chat_events for vault chat rate limiting (same hourly budget as per-doc chat).
