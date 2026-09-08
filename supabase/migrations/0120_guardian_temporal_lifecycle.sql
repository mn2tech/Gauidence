-- Temporal & Lifecycle Intelligence for guardian_items
-- Stores computed lifecycle in metadata.temporal (jsonb already on table via 0105).
-- Source documents remain immutable; temporal status is reevaluated by Watch Engine.
--
-- Rollback: no schema drop required — metadata.temporal keys can be ignored.

comment on column public.guardian_items.metadata is
  'Extensible JSON: semantic_*_ids refs and temporal lifecycle '
  '(entityType, startDate, endDate, dueDate, lifecycleStatus, actionability, '
  'actionState, validFrom, validUntil, evaluatedAt, confidence, sourceEvidence). '
  'Computed separately from immutable source documents; Watch reevaluates on read.';

-- Safe backfill: mark items that have no date anchors as lifecycle unknown.
-- Items with dates are left for Watch Engine deterministic reevaluation (no LLM).
update public.guardian_items
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'temporal',
  jsonb_build_object(
    'entityType', 'unknown',
    'lifecycleStatus', 'unknown',
    'actionability', 'informational',
    'actionState', 'current',
    'evaluatedAt', now()::text,
    'confidence', 0.5
  )
)
where
  (metadata is null or metadata->'temporal' is null)
  and event_date is null
  and due_at is null
  and start_at is null
  and end_at is null
  and status = 'active';
