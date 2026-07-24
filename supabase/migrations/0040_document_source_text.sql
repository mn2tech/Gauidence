-- Persist full extracted/OCR text for vault search and re-indexing.

alter table public.extracted_data
  add column if not exists source_text text,
  add column if not exists source_text_indexed_at timestamptz;

comment on column public.extracted_data.source_text is
  'Full native/OCR text extracted during analysis (capped in app).';
comment on column public.extracted_data.source_text_indexed_at is
  'When source_text was last embedded into document_chunks.';
