-- Fix account deletion blocked by space_conversation_messages check.
-- sender_user_id is ON DELETE SET NULL so chat history can remain in shared Spaces,
-- but space_conversation_messages_sender_user_check required sender_user_id IS NOT NULL
-- for sender_type = 'user', so auth.admin.deleteUser failed with a DB error.
-- Inserts still require a real sender via RLS (sender_user_id = auth.uid()).
-- Rollback:
--   alter table public.space_conversation_messages
--     add constraint space_conversation_messages_sender_user_check
--     check (
--       (sender_type = 'user' and sender_user_id is not null)
--       or (sender_type = 'gideon')
--     );

alter table public.space_conversation_messages
  drop constraint if exists space_conversation_messages_sender_user_check;

comment on column public.space_conversation_messages.sender_user_id is
  'Author user id for member messages; null after account deletion (message content retained).';
