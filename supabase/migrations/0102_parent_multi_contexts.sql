-- Multi-child parent school contexts: optional friendly label + reminder linkage.
-- Existing rows remain primary with null label; no data rewrite required.

alter table public.parent_school_contexts
  add column if not exists label text;

comment on column public.parent_school_contexts.label is
  'Optional friendly label (e.g. Child 1, Matthew). Not a legal name requirement.';

alter table public.parent_knowledge_reminders
  add column if not exists parent_school_context_id uuid
    references public.parent_school_contexts (id) on delete set null;

create index if not exists parent_knowledge_reminders_context_idx
  on public.parent_knowledge_reminders (parent_school_context_id)
  where parent_school_context_id is not null;

create index if not exists parent_school_contexts_user_school_idx
  on public.parent_school_contexts (user_id, school_name);
