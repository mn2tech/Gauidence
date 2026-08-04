-- Ask Gideon: per-thread search scope (current vault vs all vaults).

alter table public.vault_chats
  add column if not exists search_scope text not null default 'workspace';

alter table public.vault_chats
  drop constraint if exists vault_chats_search_scope_check;

alter table public.vault_chats
  add constraint vault_chats_search_scope_check
  check (search_scope in ('workspace', 'global'));

comment on column public.vault_chats.search_scope is
  'workspace = search only the chat home vault (+ optional scoped_profile_id); global = search every accessible vault.';
