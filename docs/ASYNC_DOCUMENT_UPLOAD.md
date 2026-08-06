# Async Document Upload

**Status:** Implemented  
**Migration:** `0066_async_document_processing.sql`

## Current latency breakdown (before)

| Step | Where | Blocks upload/analyze HTTP? |
|------|-------|----------------------------|
| Storage quota check | `POST /api/account/storage/check` | Pre-upload (~100–300ms) |
| Supabase Storage upload | Client direct | File transfer only |
| `documents` insert | Client direct | ~50–200ms |
| File download from Storage | `/api/documents/analyze` | **Yes** |
| OCR / text extraction | `runAnalysisPipeline` | **Yes** (10s–3min) |
| Claude classification + analysis | `runAnalysisPipeline` | **Yes** (5–60s) |
| `extracted_data` persist | analyze route | **Yes** |
| Chunking + OpenAI embeddings | `indexDocumentForVault` | **Yes** (2–30s) |
| Organization suggestions | `runOrganizationAfterAnalysis` | **Yes** (1–5s) |
| Knowledge extraction | fire-and-forget | No |

**Primary bottleneck:** `/api/documents/analyze` held the connection for the entire pipeline (up to 300s server / 290s client).

## After

| Step | Blocks HTTP? |
|------|----------------|
| Storage upload + DB insert | File transfer only |
| `POST /api/documents/analyze` (enqueue) | **No** — returns in &lt;2s |
| Background worker | Server-side job queue |
| UI polling | 3s interval while active |

## Architecture

```
Upload (client)
  → Storage + documents row (analysis_status=uploaded)
  → POST /api/documents/analyze
      → enqueue analyze_document job
      → return { queued: true, jobId }
      → void processPendingDocumentJobs (limit 1)

Worker (inline drain + cron every 2 min)
  analyze_document → index_document → extract_knowledge
```

## Database changes

New columns on `documents`:
- `indexing_status`, `knowledge_status`
- `processing_step`, `processing_progress`
- `last_processing_error`
- `processing_started_at`, `processing_completed_at`
- `processing_diagnostics` (jsonb, optional)

New table: `document_processing_jobs` with unique `(document_id, job_type, pipeline_version)`.

## API changes

| Route | Change |
|-------|--------|
| `POST /api/documents/analyze` | Enqueues job, returns immediately. Optional `{ sync: true }` for legacy blocking. |
| `GET /api/documents/[id]/status` | Polling endpoint with stage, progress, readiness |
| `POST /api/documents/process-jobs` | Drain jobs for signed-in user |
| `POST /api/documents/retry-analysis` | Enqueues retries per stage (analyze/index/knowledge) |
| `GET /api/cron/document-processing` | Cron worker (every 2 min) |

## Readiness levels

| Level | Meaning |
|-------|---------|
| `uploaded` | Stored, not analyzed |
| `searchable` | Analysis + indexing complete — Gideon RAG works |
| `knowledge_ready` | Knowledge graph extraction complete (or skipped) |

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DOCUMENT_PROCESSING_CONCURRENCY` | `2` | Max parallel jobs per drain |
| `GUARDIAN_PROCESSING_DIAGNOSTICS` | off (dev: on) | Stage timing logs (no content) |

## Deployment

1. Apply migration `0066_async_document_processing.sql`
2. Deploy app code
3. Vercel cron `*/2 * * * *` → `/api/cron/document-processing` (requires `CRON_SECRET`)
4. Verify: upload a PDF → analyze API returns in &lt;2s → status polls to `ready`

## Rollback

1. Revert app deploy (sync analyze route)
2. Run rollback SQL in migration header
3. Pending jobs can be abandoned safely; documents remain in vault

## Files changed

- `supabase/migrations/0066_async_document_processing.sql`
- `src/lib/documents/processingStatus.ts`
- `src/lib/documents/processingDiagnostics.ts`
- `src/lib/documents/executeAnalysis.ts`
- `src/lib/documents/processingJobs.ts`
- `src/lib/documents/clientProcessing.ts`
- `src/app/api/documents/analyze/route.ts`
- `src/app/api/documents/[id]/status/route.ts`
- `src/app/api/documents/process-jobs/route.ts`
- `src/app/api/documents/retry-analysis/route.ts`
- `src/app/api/cron/document-processing/route.ts`
- `src/hooks/useDocumentProcessingPoll.ts`
- `src/components/DocumentManager.tsx`
- `src/lib/vault/clientUpload.ts`
- `vercel.json`
- Tests: `src/lib/documents/__tests__/*`
