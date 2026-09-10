-- School Newsletter Intelligence
-- Extends guardian_items for date-aware school newsletter extraction,
-- supersession across newer newsletters, and document classification status.
-- Rollback:
--   alter table public.documents
--     drop column if exists newsletter_classification_confidence,
--     drop column if exists newsletter_extraction_status;
--   alter table public.guardian_items
--     drop column if exists superseded_by_id;
--   -- restore prior type/status checks manually if needed

-- ---------------------------------------------------------------------------
-- documents: newsletter classification / extraction status
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists newsletter_classification_confidence numeric;

alter table public.documents
  add column if not exists newsletter_extraction_status text;

do $$ begin
  alter table public.documents
    add constraint documents_newsletter_extraction_status_chk
    check (
      newsletter_extraction_status is null
      or newsletter_extraction_status in (
        'pending',
        'processing',
        'completed',
        'needs_confirmation',
        'failed',
        'skipped'
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.documents
    add constraint documents_newsletter_classification_confidence_chk
    check (
      newsletter_classification_confidence is null
      or (
        newsletter_classification_confidence >= 0
        and newsletter_classification_confidence <= 1
      )
    );
exception when duplicate_object then null;
end $$;

comment on column public.documents.newsletter_classification_confidence is
  '0..1 confidence that this document is a school newsletter (school_newsletter).';

comment on column public.documents.newsletter_extraction_status is
  'School newsletter extraction lifecycle when document_type=school_newsletter.';

-- ---------------------------------------------------------------------------
-- guardian_items: supersession + expanded school item types
-- ---------------------------------------------------------------------------
alter table public.guardian_items
  add column if not exists superseded_by_id uuid
    references public.guardian_items (id) on delete set null;

create index if not exists guardian_items_superseded_by_idx
  on public.guardian_items (superseded_by_id)
  where superseded_by_id is not null;

comment on column public.guardian_items.superseded_by_id is
  'When status=superseded, points at the newer confirmed item from a later newsletter.';

-- Expand status check to include superseded
alter table public.guardian_items
  drop constraint if exists guardian_items_status_chk;

alter table public.guardian_items
  add constraint guardian_items_status_chk check (
    status in (
      'active',
      'completed',
      'dismissed',
      'expired',
      'cancelled',
      'superseded'
    )
  );

-- Expand type check for school newsletter structured items
alter table public.guardian_items
  drop constraint if exists guardian_items_type_chk;

alter table public.guardian_items
  add constraint guardian_items_type_chk check (
    type in (
      'event',
      'deadline',
      'reminder',
      'task',
      'payment',
      'renewal',
      'expiration',
      'appointment',
      'school_closure',
      'follow_up',
      'commitment',
      'return_window',
      'warranty',
      'birthday',
      'travel',
      'document_requirement',
      'informational',
      'school_event',
      'homework',
      'test',
      'study_reminder',
      'spelling_list',
      'announcement',
      'school_contact',
      'early_dismissal',
      'no_school',
      'no_homework'
    )
  );
