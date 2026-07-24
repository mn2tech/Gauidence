-- Temporary cross-vault scope for Ask Gideon threads (auto-answer from another profile).

alter table public.vault_chats
  add column if not exists scoped_profile_id uuid references public.guardian_profiles (id) on delete set null;

create index if not exists vault_chats_scoped_profile_id_idx
  on public.vault_chats (scoped_profile_id)
  where scoped_profile_id is not null;

comment on column public.vault_chats.scoped_profile_id is
  'When set, this chat thread searches the named profile vault without changing the user active profile.';
