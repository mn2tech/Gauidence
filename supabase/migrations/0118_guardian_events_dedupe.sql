-- Guardian Events — reject duplicate Tell Guardian / unsourced rows.
-- Also remove existing near-duplicates safely (keep oldest).
-- Rollback:
--   drop index if exists public.guardian_events_unsourced_dedupe_uidx;

-- ---------------------------------------------------------------------------
-- Cleanup: exact unsourced duplicates (same user/type/dedupe_key)
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, source_type, dedupe_key
      order by created_at asc, id asc
    ) as rn
  from public.guardian_events
  where source_id is null
    and dedupe_key is not null
)
delete from public.guardian_events e
using ranked r
where e.id = r.id
  and r.rn > 1;

-- Cleanup: Tell Guardian near-duplicates (same title+summary body, old timestamp keys)
with ranked as (
  select
    id,
    row_number() over (
      partition by
        user_id,
        source_type,
        lower(trim(title)),
        left(coalesce(summary, ''), 400)
      order by created_at asc, id asc
    ) as rn
  from public.guardian_events
  where source_type = 'tell_guardian'
)
delete from public.guardian_events e
using ranked r
where e.id = r.id
  and r.rn > 1;

-- Cleanup: sourced exact duplicates if any slipped past unique index races
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, source_type, source_id, dedupe_key
      order by created_at asc, id asc
    ) as rn
  from public.guardian_events
  where source_id is not null
    and dedupe_key is not null
)
delete from public.guardian_events e
using ranked r
where e.id = r.id
  and r.rn > 1;

-- ---------------------------------------------------------------------------
-- Unique: unsourced events (Tell Guardian / manual) by content dedupe key
-- ---------------------------------------------------------------------------
create unique index if not exists guardian_events_unsourced_dedupe_uidx
  on public.guardian_events (user_id, source_type, dedupe_key)
  where source_id is null and dedupe_key is not null;

comment on index public.guardian_events_unsourced_dedupe_uidx is
  'Rejects duplicate Tell Guardian / manual events with the same content dedupe key.';
