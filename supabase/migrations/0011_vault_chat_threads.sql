-- Allow multiple vault chat threads per user (history + new chat).
-- Run in the Supabase SQL Editor after 0010_vault_rag.sql.

alter table public.vault_chats
  drop constraint if exists vault_chats_user_id_key;

alter table public.vault_chats
  add column if not exists title text not null default 'New chat';

create index if not exists vault_chats_user_updated_idx
  on public.vault_chats (user_id, updated_at desc);
