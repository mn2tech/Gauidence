-- Guardian Vision: persist structured image understanding beside the original asset.
-- The original file in storage remains the authoritative evidence source.

alter table public.extracted_data
  add column if not exists vision_status text,
  add column if not exists vision_model text,
  add column if not exists vision_summary text,
  add column if not exists vision_transcription text,
  add column if not exists vision_metadata jsonb,
  add column if not exists vision_analyzed_at timestamptz,
  add column if not exists vision_error text;

comment on column public.extracted_data.vision_status is
  'Image vision analysis: queued | analyzing | analyzed | failed. Independent of OCR character count.';
comment on column public.extracted_data.vision_model is
  'Vision model id used for this analysis (operational, not shown to users).';
comment on column public.extracted_data.vision_summary is
  'Short visual description / summary from Guardian Vision.';
comment on column public.extracted_data.vision_transcription is
  'Readable text transcribed from the image when present.';
comment on column public.extracted_data.vision_metadata is
  'Structured VisionResult JSON (entities, dates, amounts, facts).';
comment on column public.extracted_data.vision_analyzed_at is
  'When Guardian Vision last completed for this document.';
comment on column public.extracted_data.vision_error is
  'Failure reason when vision_status = failed. Never treat 0 OCR characters as success.';

alter table public.documents
  add column if not exists content_type text,
  add column if not exists analysis_type text;

comment on column public.documents.content_type is
  'Coarse asset kind: image | pdf | document | generic.';
comment on column public.documents.analysis_type is
  'How the file was understood: vision | document | generic.';

update public.documents
set content_type = 'image'
where content_type is null
  and mime_type like 'image/%';

update public.documents
set content_type = 'pdf'
where content_type is null
  and mime_type = 'application/pdf';

alter table public.document_chunks
  add column if not exists content_type text;

comment on column public.document_chunks.content_type is
  'Chunk source kind for retrieval filters (image | pdf | document | generic).';
