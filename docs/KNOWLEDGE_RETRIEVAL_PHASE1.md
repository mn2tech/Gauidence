# Guardian Knowledge Retrieval — Phase 1

**Status:** Implemented  
**Scope:** HNSW indexing, async document indexing, hybrid retrieval, diagnostics, embedding cache, inventory optimization

## Overview

Phase 1 improves Ask Gideon's document retrieval speed, exact-term matching, and scalability without replacing the existing vault security model (RLS, `can_view_vault_document_row`, profile scoping).

## Components

| Module | Role |
|--------|------|
| `supabase/migrations/0064_guardian_knowledge_retrieval_phase1.sql` | HNSW index, FTS/trigram indexes, `document_index_jobs`, `search_document_chunks_keyword` RPC |
| `src/lib/vault/hybridRetrieval.ts` | Vector + keyword retrieval with Reciprocal Rank Fusion |
| `src/lib/vault/indexingJobs.ts` | Async indexing queue (pending → processing → completed/failed/stale) |
| `src/lib/vault/embeddingCache.ts` | In-memory TTL cache for query embeddings (SHA-256 key) |
| `src/lib/vault/retrievalDiagnostics.ts` | Structured dev/admin logging |
| `src/lib/vault/loadInventory.ts` | Conditional full vs summary file inventory |

## Retrieval flow

```
User question
    → expandRetrievalQuestion()
    → embedQuery() [cached]
    → parallel:
        • match_document_chunks[_multi] (top 20 vector)
        • search_document_chunks_keyword (top 20 keyword/FTS/trigram)
    → Reciprocal Rank Fusion + identifier boost
    → top 12 chunks → formatRetrievalContext → Gideon prompt
```

## Ranking formula

**Reciprocal Rank Fusion (RRF)** with constant `k = 60`:

```
fusion_score(chunk) = Σ 1/(k + rank_i)  +  0.15 × identifier_hits
```

Where `rank_i` is the 1-based rank from each retrieval channel (vector, keyword). Identifier hits count query tokens matching invoice numbers, codes, or alphanumeric IDs in filename or chunk text.

Final results are sorted by `fusion_score` descending, capped at 12 (or 10 for picture requests).

## Query performance

| Operation | Before Phase 1 | After Phase 1 (expected) |
|-----------|----------------|--------------------------|
| Vector search (10k+ chunks) | Sequential scan, O(n) | HNSW ANN, ~10–50ms |
| Keyword exact match | ILIKE only in UI search | FTS + trigram on chunks + extracted_data |
| Chat cold start | Vault-wide sync indexing | Enqueue only (~ms) |
| Repeat questions | Re-embed every time | Cached embedding (15 min TTL) |
| File inventory | 250 docs every message | Full list only on inventory questions |

HNSW parameters: `m = 16`, `ef_construction = 64` (pgvector defaults for cosine).

## Indexing behavior

| Trigger | Action |
|---------|--------|
| Document analyzed | Index immediately + mark job completed + drain up to 3 pending jobs |
| Gideon chat POST | Enqueue missing/stale jobs only (non-blocking) |
| Pending jobs | Processed after analyze, not during chat |

Statuses: `pending`, `processing`, `completed`, `failed`, `stale`.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GUARDIAN_EMBEDDING_CACHE_ENABLED` | `true` | Set `false` to disable query embedding cache |
| `GUARDIAN_EMBEDDING_CACHE_MAX_SIZE` | `256` | Max cached embeddings |
| `GUARDIAN_EMBEDDING_CACHE_TTL_MS` | `900000` | Cache TTL (15 minutes) |
| `GUARDIAN_RETRIEVAL_DIAGNOSTICS` | off (dev: on) | Structured retrieval logging |

## Deployment

1. Apply migration `0064_guardian_knowledge_retrieval_phase1.sql` via Supabase CLI or dashboard.
2. HNSW index builds in background on existing data (safe, non-destructive).
3. Deploy application code.
4. Monitor `gideon_retrieval_diagnostics` logs in development.

## Rollback

```sql
-- See rollback comments in 0064 migration
drop function if exists public.search_document_chunks_keyword(text, uuid[], int);
drop table if exists public.document_index_jobs;
drop type if exists public.document_index_status;
drop index if exists public.document_chunks_embedding_hnsw_idx;
```

Revert application code to use vector-only retrieval and synchronous `ensureUserVaultIndexed`.

## Security

- All RPCs use `security invoker` and existing `can_view_vault_document_row` checks.
- Embedding cache keys are SHA-256 hashes — raw questions are not stored.
- Diagnostics log query hash only, never source text.
- `document_index_jobs` RLS restricts rows to `auth.uid() = user_id`.

## Not in Phase 1

Knowledge graph, persistent memory, external connectors, SSO, new UI.
