# Connector → Ontology

Analyze connected Device Storage files directly into Guardian ontology **without** copying files into Guardian document storage.

## Flow

```text
source_item (metadata)
  → temporary browser read
  → POST /api/connections/:id/items/:itemId/analyze
  → content extract + ontology LLM
  → ontology_entities / relationships / evidence
     (source_type = connector, source_id = source_items.id)
```

## Migration

`0078_source_item_analysis.sql` — extends `processing_status` and analysis metadata columns.

## UI

- File detail → **Analyze with Guardian** → Analysis Complete + Confirm/Reject
- Browse folder → checkboxes + **Analyze selected** / **Analyze new** (sequential, N/M progress)
- Batch prompts once for folder access (persisted handle or compatible folder share)

Hide Analyze with `NEXT_PUBLIC_GUARDIAN_SOURCE_ANALYZE=false`.

## Rules

- Original file stays on the device
- Request-scoped bytes only (max 15 MB)
- Supported for Analyze: PDF, images, text, CSV, and Excel (`.xlsx` / `.xls`)
- Re-analyze with the same content hash is idempotent
- Evidence always points at `source_items.id`
- Batch Analyze runs one file at a time against the existing analyze API (no multi-file upload endpoint)
