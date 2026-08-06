# Guardian Knowledge Engine — Phase 2

**Status:** Implemented (pilot-ready)  
**Flag:** `GUARDIAN_KNOWLEDGE_ENGINE_V2_ENABLED=false` (default)

## Overview

Phase 2 adds structured organizational knowledge on top of Phase 1 document retrieval. Gideon continues using hybrid RAG; structured facts are an **additional evidence source** injected into the system prompt.

## Architecture

```
Document analyzed
    → enqueue guardian_knowledge_extraction_jobs
    → processPendingKnowledgeJobs (async, non-blocking)
    → LLM structured extraction (Claude + JSON schema)
    → entity resolution + confidence gating
    → persist entities, facts, relationships (with provenance)
    → supersede older facts when newer effective dates arrive

Gideon question
    → hybrid document retrieval (Phase 1)
    → retrieveStructuredKnowledge (Phase 2)
    → merge into prompt as STRUCTURED KNOWLEDGE block
```

## Database (migration 0065)

| Table | Purpose |
|-------|---------|
| `guardian_knowledge_facts` | Subject-predicate-object facts with provenance |
| `guardian_knowledge_entity_aliases` | Entity alias registry |
| `guardian_knowledge_entity_merge_suggestions` | Pending merge review |
| `guardian_knowledge_extraction_jobs` | Async extraction queue |

Extended: `guardian_knowledge_entities` (canonical_entity_id, review_status, source fields)

## RLS changes

Replaced owner-only policies with:
- **SELECT:** `can_access_guardian_profile(profile_id)` + `can_view_knowledge_source(source_document_id)`
- **INSERT/UPDATE:** `can_edit_guardian_profile(profile_id)`

Facts from hidden (`client_visible=false`) documents are not visible to viewers.

## Confidence thresholds

| Confidence | Behavior |
|------------|----------|
| ≥ 0.90 (configurable) | `confirmed` — auto-saved |
| 0.70–0.89 | `suggested` — saved, awaits review |
| < 0.70 | Not persisted |

Env vars: `GUARDIAN_KNOWLEDGE_AUTO_SAVE_THRESHOLD`, `GUARDIAN_KNOWLEDGE_SUGGEST_THRESHOLD`

## Ranking formula

```
knowledge_score = entity_match_score × relationship_relevance × confidence × freshness_factor
```

Structured knowledge is capped at 12 facts per query. Low-confidence graph facts do not outrank strong document evidence (separate prompt block, document RAG unchanged).

## Pilot backfill plan

1. Enable `GUARDIAN_KNOWLEDGE_ENGINE_V2_ENABLED=true` in staging
2. Apply migration `0065`
3. Select one test vault/profile (e.g. NM2TECH business vault)
4. Enqueue jobs via Settings → Knowledge Engine → Reprocess, or:
   ```sql
   INSERT INTO guardian_knowledge_extraction_jobs (document_id, profile_id, user_id)
   SELECT d.id, d.profile_id, d.user_id FROM documents d
   JOIN extracted_data e ON e.document_id = d.id
   WHERE d.profile_id = '<pilot-profile-id>'
   ON CONFLICT DO NOTHING;
   ```
5. Process in batches of 2 jobs (rate-limited in `processPendingKnowledgeJobs`)
6. Estimated cost: ~$0.01–0.03 per document (Haiku structured extraction)
7. Monitor `/api/knowledge/health` and Settings → Knowledge Engine
8. Pause by disabling flag; resume by re-enabling

**Do not run full 231-document backfill automatically.**

## Rollback

```sql
-- See rollback comments in 0065 migration
```

Disable `GUARDIAN_KNOWLEDGE_ENGINE_V2_ENABLED`. Gideon reverts to document-only retrieval.

## Known limitations

- No graph visualization
- Merge suggestions require manual review (no auto-merge except exact normalized name match)
- Full backfill not automated
- Conversation source type not wired
- Relationship rows lack source_document_id (facts have full provenance)

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `GUARDIAN_KNOWLEDGE_ENGINE_V2_ENABLED` | `false` | Enable Phase 2 |
| `GUARDIAN_KNOWLEDGE_AUTO_SAVE_THRESHOLD` | `0.9` | Auto-confirm threshold |
| `GUARDIAN_KNOWLEDGE_SUGGEST_THRESHOLD` | `0.7` | Minimum persist threshold |
| `GUARDIAN_KNOWLEDGE_DIAGNOSTICS` | off (dev: on) | Extraction logging |

## UI

- **Settings → Knowledge Engine** (`/settings/knowledge`)
- Health dashboard, suggested fact review, analysis retry controls
