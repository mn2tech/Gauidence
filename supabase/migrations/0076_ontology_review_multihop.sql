-- Ontology Phase 2: review queue + support for multi-hop reasoning (app-layer).
-- Rollback:
--   alter table public.ontology_entities drop column if exists review_status;
--   alter table public.ontology_relationships drop column if exists review_status;
--   drop type if exists public.ontology_review_status;

do $$ begin
  create type public.ontology_review_status as enum (
    'pending',
    'confirmed',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

alter table public.ontology_entities
  add column if not exists review_status public.ontology_review_status
    not null default 'pending';

alter table public.ontology_relationships
  add column if not exists review_status public.ontology_review_status
    not null default 'pending';

comment on column public.ontology_entities.review_status is
  'Review queue: pending | confirmed | rejected';
comment on column public.ontology_relationships.review_status is
  'Review queue: pending | confirmed | rejected';

-- Backfill: high-confidence and manual rows are confirmed; low-confidence stay pending.
update public.ontology_entities
set review_status = 'confirmed'
where review_status = 'pending'
  and (
    source_type = 'manual'
    or coalesce(confidence, 0) >= 0.9
  );

update public.ontology_relationships
set review_status = 'confirmed'
where review_status = 'pending'
  and (
    created_by is not null
    and coalesce(confidence, 0) >= 0.9
  );

-- Also confirm high-confidence AI relationships even without created_by.
update public.ontology_relationships
set review_status = 'confirmed'
where review_status = 'pending'
  and coalesce(confidence, 0) >= 0.9;

create index if not exists ontology_entities_review_idx
  on public.ontology_entities (profile_id, review_status);

create index if not exists ontology_relationships_review_idx
  on public.ontology_relationships (profile_id, review_status);
