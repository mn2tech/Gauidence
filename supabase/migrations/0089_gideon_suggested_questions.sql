-- Suggested follow-up questions on Ask Gideon assistant messages.
-- Returned as structured data for clickable UI chips (not parsed from prose).

alter table public.vault_chat_messages
  add column if not exists suggested_questions jsonb not null default '[]'::jsonb;

comment on column public.vault_chat_messages.suggested_questions is
  'Contextual follow-up questions for the Ask Gideon answer UI (3–4 chips).';
