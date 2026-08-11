# Guardian Ontology Engine — Phase 1

The Guardian Ontology Engine is an intelligence layer that sits alongside existing Guardian data. It does **not** replace documents, indexing, Spaces, Gideon, or the Knowledge Engine.

## Architecture

```text
Existing Guardian Data (documents, logs, memories)
        +
Guardian Ontology Engine
        ↓
Entities → Relationships → Evidence → Events (schema only)
        ↓
Future Gideon integration (Phase 2)
```

- **Source of truth**: Existing `documents`, `extracted_data`, and `document_chunks` tables remain unchanged.
- **Space isolation**: All ontology tables use `profile_id` (Guardian Space) with RLS via `can_access_guardian_profile` / `can_edit_guardian_profile` / `can_manage_guardian_profile`.
- **Non-blocking**: Ontology extraction runs after indexing. Failures set `documents.ontology_status = failed` but do not fail document upload or analysis.

## Database schema

Migration: `supabase/migrations/0073_guardian_ontology_phase1.sql`

| Table | Purpose |
|-------|---------|
| `ontology_entities` | People, organizations, projects, contracts, invoices, documents |
| `ontology_entity_aliases` | Alternate names for entity resolution |
| `ontology_relationships` | Directed edges between entities |
| `ontology_evidence` | Provenance linking facts to source documents/text |
| `ontology_events` | Schema present; light Phase 1 integration |

`documents.ontology_status`: `pending | processing | completed | failed | retryable | skipped`

## Extraction flow

```text
Upload
  → analyze_document
  → index_document
  → extract_ontology (if GUARDIAN_ONTOLOGY_ENABLED=true)
  → extract_knowledge (if GUARDIAN_KNOWLEDGE_ENGINE_V2_ENABLED=true)
  → ready
```

Implementation: `src/lib/documents/processingJobs.ts` → `runOntologyJob()` → `src/lib/ontology/processJob.ts`

## Entity resolution

`resolveOntologyEntity()` in `src/lib/ontology/resolve.ts`:

1. Match canonical normalized name within Space
2. Match aliases
3. Conservative fuzzy match (organizations/projects only, high threshold)
4. Create new entity

Normalization: `normalizeEntityName()` in `src/lib/ontology/normalize.ts`

## Evidence / provenance

Every AI-extracted relationship requires an `evidence` quote. Stored in `ontology_evidence` with `document_id`, `source_type`, and `source_id`.

## Security / RLS

- All API routes verify authenticated user + Space membership
- `profileId` / `spaceId` from client is never trusted without `requireAccessibleGuardianProfile`
- Admin backfill: `isPlatformAdmin` + `POST /api/admin/ontology/backfill`
- Ontology Explorer: `/settings/ontology` (platform admin only)

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ontology/search?profileId=&q=` | Search entities |
| GET | `/api/ontology/entities/[id]` | Entity graph (one-hop) |
| DELETE | `/api/ontology/entities/[id]` | Delete ontology entity (not source doc) |
| POST | `/api/ontology/entities` | Manual entity creation |
| POST | `/api/ontology/relationships` | Manual relationship creation |
| GET | `/api/ontology/stats?profileId=` | Space ontology stats |
| GET | `/api/ontology/documents/[id]/summary` | Document ontology status |
| POST | `/api/admin/ontology/backfill` | Admin backfill (admin only) |

## Feature flag

```env
GUARDIAN_ONTOLOGY_ENABLED=true
GUARDIAN_ONTOLOGY_DIAGNOSTICS=false
GUARDIAN_ONTOLOGY_FUZZY_THRESHOLD=0.92
```

When disabled, existing Guardian behavior is unchanged.

## Backfill instructions

1. Enable `GUARDIAN_ONTOLOGY_ENABLED=true`
2. Sign in as platform admin (`ADMIN_EMAILS`)
3. Open `/settings/ontology`
4. Use "Backfill 1/5/10 docs" buttons, or:

```bash
curl -X POST /api/admin/ontology/backfill \
  -H "Content-Type: application/json" \
  -d '{"spaceId":"<profile-uuid>","limit":5}'
```

## Testing

```bash
npm test -- src/lib/ontology/__tests__/ontology.test.ts
```

Tests cover normalization, schema validation, fuzzy-match guards, and deletion safety patterns.

## Migration commands

```bash
# Apply migration (local Supabase)
npx supabase db push

# Or via SQL in Supabase dashboard
# Run supabase/migrations/0073_guardian_ontology_phase1.sql
```

## Rollback procedure

```sql
drop table if exists public.ontology_evidence;
drop table if exists public.ontology_events;
drop table if exists public.ontology_relationships;
drop table if exists public.ontology_entity_aliases;
drop table if exists public.ontology_entities;
alter table public.documents drop column if exists ontology_status;
-- Note: enum value extract_ontology cannot be easily removed; leave in place.
```

Set `GUARDIAN_ONTOLOGY_ENABLED=false` to disable without rollback.

## Manual verification

1. Set `GUARDIAN_ONTOLOGY_ENABLED=true` and run migration
2. Upload a business document to a Space
3. Wait for processing pipeline to complete
4. Open `/settings/ontology` as admin
5. Search for extracted entities (e.g. organization names)
6. Click entity → view relationships and evidence
7. Re-upload same document → verify no duplicate explosion

## Known limitations (Phase 1)

- Events table exists but minimal integration
- Fuzzy matching limited to organizations/projects
- Admin Explorer uses active Space profile

## Ontology map (Phase 2)

Admin Ontology Explorer includes a lightweight **one-hop SVG map** (no graph DB / no React Flow). Click a connected node to open that entity. Entity details also list **up to 2-hop paths** from the selected node.

## Multi-hop reasoning (Phase 2)

`getEntityPaths` BFS (max 2 hops) powers:

- Gideon context: `PATHS (up to 2-hop)` via `getPathsBetweenMatchedEntities`
- Entity graph: `paths` on `getEntityGraph`
- API: `GET /api/ontology/paths?profileId=&from=&to=&maxHops=2`

Rejected review items are excluded from path traversal.

## Review queue (Phase 2)

Migration `0076_ontology_review_multihop.sql` adds `review_status` (`pending` | `confirmed` | `rejected`) on entities and relationships.

- AI extractions with confidence &lt; 0.9 → `pending`
- Manual creates and confidence ≥ 0.9 → `confirmed`
- Stats `needsReview` counts pending entities + relationships
- Admin Explorer **Needs review** tab: Confirm / Reject
- API: `GET` / `PATCH /api/ontology/review`
- Rejected rows are hidden from search, Gideon, and graph paths

## Gideon integration (Phase 2)

When `GUARDIAN_ONTOLOGY_ENABLED=true`, Ask Gideon loads one-/two-hop ontology context for the active/explicit Space via `getOntologyContext()` and injects an `--- ONTOLOGY ---` block into the system prompt (`loadWorkspaceContext` → `formatOntologyForGideon`).

- Failures are caught; chat continues without ontology
- Does not replace RAG excerpts — complements them for entity/relationship questions

## Phase 2 recommendations (remaining)

- Customer-facing entity management
- Connector sources (`api`, `connector` source types)
- Dedicated `ontology.nm2tech.com` admin UI (same database)
- Richer interactive graph (pan/zoom library) if one-hop SVG is not enough
