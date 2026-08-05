-- Track imported ChatGPT / Claude conversation threads for deduplication and UI badges.

alter table public.vault_chats
  add column if not exists imported_from text
    check (imported_from in ('chatgpt', 'claude')),
  add column if not exists external_id text;

create unique index if not exists vault_chats_user_external_import_idx
  on public.vault_chats (user_id, imported_from, external_id)
  where external_id is not null;

comment on column public.vault_chats.imported_from is
  'When set, this thread was imported from an external chat export (chatgpt or claude).';

comment on column public.vault_chats.external_id is
  'Stable id from the source export (conversation_id / uuid) for deduplication.';
