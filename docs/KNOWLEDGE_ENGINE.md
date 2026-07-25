# Guardian Knowledge Engine — Shadow Mode Foundation

**Status:** Shadow mode (no database writes)  
**Flag:** `GUARDIAN_KNOWLEDGE_ENGINE_ENABLED=false` (default)

## Purpose

The Knowledge Engine derives structured knowledge from existing Guardian sources — documents and Daily Logs — without replacing them as the source of truth. Original content stays in `documents`, `extracted_data`, and `daily_logs`. The engine eventually stores only derived items (entities, memories, relationships, timeline events, tasks, expirations, reminders).

## Shadow mode (current phase)

- Runs **after** a document is analyzed or a Daily Log is saved.
- Returns and logs a `KnowledgePreview` only.
- **Does not** create, update, or delete any Supabase records.
- **Does not** include a Supabase client inside the engine.
- Failures are caught by `triggerKnowledgeEngine()` and never affect the parent HTTP response.

### Document analysis enrichment (Phase 1)

For documents, the analyze route passes structured fields from the existing
`GuardianAnalysis` result (`people`, `organizations`, `important_dates`,
`obligations`, `suggested_actions`, `amounts`, `summary`) via
`analysisContext`. This reuses the AI analysis already performed — no extra
LLM calls and no duplication of raw `source_text`.

## Integration points

| Trigger | Route | When |
|---------|-------|------|
| Document analyzed | `POST /api/documents/analyze` | After `extracted_data` is saved |
| Daily Log created | `POST /api/logs` | After `daily_logs` insert succeeds |

Both routes call `void triggerKnowledgeEngine(...)` so the Knowledge Engine does not delay or change the response.

## Source traceability

Every derived preview item carries:

- `sourceType` — `document`, `daily_log`, or `conversation`
- `sourceId` — originating record id
- `profileId` — guardian profile (vault container)
- `vaultId` — same as `profileId` when the vault is known

## Modules

| File | Role |
|------|------|
| `src/lib/knowledge/document-analysis-context.ts` | Maps `GuardianAnalysis` → engine input |
| `src/lib/knowledge/enrich-from-analysis.ts` | Builds preview from analysis fields |
| `src/lib/knowledge/merge-preview.ts` | Merges analysis + heuristic previews |
| `src/lib/knowledge/types.ts` | Input/preview types |
| `src/lib/knowledge/knowledge-engine.ts` | `KnowledgeEngine.process()` orchestrator |
| `src/lib/knowledge/entity-extractor.ts` | Deterministic entity extraction |
| `src/lib/knowledge/memory-generator.ts` | Suggested memories |
| `src/lib/knowledge/timeline-generator.ts` | Suggested timeline events |
| `src/lib/knowledge/relationship-builder.ts` | Suggested relationships |
| `src/lib/knowledge/trigger-knowledge-engine.ts` | Feature-flagged route entry point |
| `src/lib/features/knowledge-engine.ts` | `GUARDIAN_KNOWLEDGE_ENGINE_ENABLED` gate |

## Enabling locally

```env
GUARDIAN_KNOWLEDGE_ENGINE_ENABLED=true
```

Restart the dev server. Check server logs for `knowledge_engine_*` events.

## Next phases (not implemented)

- Persist derived knowledge to new tables with RLS
- Wire `conversation` source type from vault chat
- LLM-assisted extraction behind the same preview interface
