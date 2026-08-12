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

File detail → **Analyze with Guardian** → Analysis Complete + Confirm/Reject.

Hide Analyze with `NEXT_PUBLIC_GUARDIAN_SOURCE_ANALYZE=false`.

## Rules

- Original file stays on the device
- Request-scoped bytes only (max 15 MB)
- Re-analyze with the same content hash is idempotent
- Evidence always points at `source_items.id`
