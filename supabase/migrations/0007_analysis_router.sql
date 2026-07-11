-- Routed document analysis: status tracking + richer extraction payload.
-- Keeps existing facts/summary for display compatibility.

alter table public.documents
  add column if not exists analysis_status text not null default 'uploaded';

alter table public.extracted_data
  add column if not exists document_type text,
  add column if not exists document_subtype text,
  add column if not exists classification_confidence double precision,
  add column if not exists guardian_status text,
  add column if not exists overall_confidence double precision,
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists specialist jsonb not null default '{}'::jsonb,
  add column if not exists title text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists documents_analysis_status_idx
  on public.documents (user_id, analysis_status);
