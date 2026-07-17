-- Sprint 11: Universal vault search indexes + chat-message RLS hardening.
-- Safe to re-run.

create extension if not exists pg_trgm;

-- Profile name / org fields
create index if not exists guardian_profiles_display_name_trgm_idx
  on public.guardian_profiles using gin (display_name gin_trgm_ops);

create index if not exists guardian_profiles_org_trgm_idx
  on public.guardian_profiles using gin (
    (coalesce(organization_name, '') || ' ' || coalesce(business_legal_name, '') || ' ' || coalesce(school_name, ''))
    gin_trgm_ops
  );

-- Daily logs
create index if not exists daily_logs_content_trgm_idx
  on public.daily_logs using gin (content gin_trgm_ops);

create index if not exists daily_logs_title_trgm_idx
  on public.daily_logs using gin (coalesce(title, '') gin_trgm_ops);

-- Documents
create index if not exists documents_file_name_trgm_idx
  on public.documents using gin (file_name gin_trgm_ops);

-- Extracted analysis text
create index if not exists extracted_data_title_trgm_idx
  on public.extracted_data using gin (coalesce(title, '') gin_trgm_ops);

create index if not exists extracted_data_summary_trgm_idx
  on public.extracted_data using gin (coalesce(summary, '') gin_trgm_ops);

-- Vault chats
create index if not exists vault_chats_title_trgm_idx
  on public.vault_chats using gin (title gin_trgm_ops);

create index if not exists vault_chat_messages_content_trgm_idx
  on public.vault_chat_messages using gin (content gin_trgm_ops);

-- Harden message RLS: message must belong to an owned vault chat thread.
drop policy if exists "Users can view own vault chat messages" on public.vault_chat_messages;
drop policy if exists "Users can insert own vault chat messages" on public.vault_chat_messages;
drop policy if exists "Users can delete own vault chat messages" on public.vault_chat_messages;

create policy "Users can view own vault chat messages"
  on public.vault_chat_messages for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.vault_chats vc
      where vc.id = vault_chat_messages.chat_id
        and vc.user_id = auth.uid()
        and public.owns_guardian_profile(vc.profile_id)
    )
  );

create policy "Users can insert own vault chat messages"
  on public.vault_chat_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.vault_chats vc
      where vc.id = vault_chat_messages.chat_id
        and vc.user_id = auth.uid()
        and public.owns_guardian_profile(vc.profile_id)
    )
  );

create policy "Users can delete own vault chat messages"
  on public.vault_chat_messages for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.vault_chats vc
      where vc.id = vault_chat_messages.chat_id
        and vc.user_id = auth.uid()
        and public.owns_guardian_profile(vc.profile_id)
    )
  );
