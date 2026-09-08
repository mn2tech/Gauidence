-- Ask Gideon: default search across all authorized spaces.
-- Users can still narrow to "This space" per chat.
-- Rollback:
--   alter table public.vault_chats alter column search_scope set default 'workspace';

alter table public.vault_chats
  alter column search_scope set default 'global';

-- Existing threads: flip to cross-space so Ask feels consistent.
-- Explicit "This space" preference can be restored in the UI anytime.
update public.vault_chats
set search_scope = 'global'
where search_scope = 'workspace';

comment on column public.vault_chats.search_scope is
  'Ask Gideon retrieval scope: global (all authorized spaces, default) or workspace (this space only).';
