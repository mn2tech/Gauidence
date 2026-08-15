# Guardian Pack Engine V1

Guardian Packs teach Guardian how to understand a particular organization or industry. They sit on top of existing Guardian core — they do **not** replace Spaces, documents, proposals, connectors, RLS, or Gideon.

```text
GUARDIAN CORE
│
├── Authentication / Profiles / Spaces (guardian_profiles)
├── Permissions / RLS
├── Documents / Chunks / Search
├── Connected Sources
├── Proposals
└── Gideon
        │
        ▼
GUARDIAN PACK ENGINE
        │
        ├── Pack Definitions + Versions
        ├── Entity / Relationship Types
        ├── Recommended Spaces
        ├── Gideon Skills
        ├── Rules / Starter Questions
        └── Dashboard Configuration
                │
                ▼
GUARDIAN ONTOLOGY (entities · relationships · evidence)
                │
                ▼
              GIDEON
```

## Product principle

> Teach Guardian how to understand an organization.

Packs evolve Guardian from **Store → Search → Answer** toward **Connect → Understand → Relate → Reason → Recommend → Act**.

## Tenancy model

Guardian does not have a separate `organizations` table. **Business / nonprofit Spaces** (`guardian_profiles` with `profile_type` `business` or `non_profit`) are the install target.

| Spec term | Guardian implementation |
|-----------|-------------------------|
| Organization | Business/nonprofit `guardian_profiles` row |
| `organization_packs` | `profile_packs` (`profile_id` + `pack_id`) |
| Recommended Spaces | Nested child `guardian_profiles` (usually `other`) |

## Schema

Migration: `supabase/migrations/0081_pack_engine.sql`

### Catalog (global, read by authenticated users)

| Table | Purpose |
|-------|---------|
| `packs` | Pack metadata (`slug`, `name`, `pack_number`, …) |
| `pack_versions` | Semver versions (`1.0.0`, …) |
| `pack_entity_types` | Ontology entity keys for this version |
| `pack_relationship_types` | Allowed relationship definitions |
| `pack_spaces` | Recommended Spaces (checkbox install) |
| `pack_gideon_skills` | Prompt addons / skill metadata |
| `pack_rules` | Extraction / lifecycle rules (jsonb) |
| `pack_starter_questions` | Suggested Gideon questions |
| `pack_dashboard_config` | Dashboard card definitions (jsonb) |

### Installs (Space-scoped + RLS)

| Table | Purpose |
|-------|---------|
| `profile_packs` | Install record + `configuration` jsonb |
| `profile_pack_spaces` | Maps pack Space keys → created/reused profiles (idempotent) |
| `pack_install_events` | Audit trail (`install`, `reinstall`, `analyze_knowledge`, …) |

### Rollback

```sql
drop table if exists public.pack_install_events;
drop table if exists public.profile_pack_spaces;
drop table if exists public.profile_packs;
drop table if exists public.pack_dashboard_config;
drop table if exists public.pack_starter_questions;
drop table if exists public.pack_rules;
drop table if exists public.pack_gideon_skills;
drop table if exists public.pack_spaces;
drop table if exists public.pack_relationship_types;
drop table if exists public.pack_entity_types;
drop table if exists public.pack_versions;
drop table if exists public.packs;
```

Existing documents, ontology rows, proposals, and Spaces are **not** deleted by uninstalling catalog tables — only pack metadata / install links.

## Installation lifecycle

1. User opens **Settings → Packs** (feature-flagged).
2. Selects **Guardian Business** → View.
3. **Recommended setup** — checkboxes for Spaces (Clients, Contracts, …).
4. **Install** — idempotent upsert of `profile_packs` + ensure Spaces (reuse by display name).
5. Optional **Analyze Existing Knowledge** — explicit selection; queues `extract_ontology` jobs.
6. Use **Business Dashboard**, **Ontology Explorer**, or **Ask Gideon**.

Installation is:

- **Idempotent** — re-run does not duplicate Spaces or install rows
- **Version-aware** — stores `pack_version_id`
- **Organization-scoped** — `profile_id` + RLS
- **Auditable** — `pack_install_events`
- **Safe to retry**

## Pack definition structure

UI renders from catalog tables — do not hard-code Pack UIs per vertical.

```text
Pack
├── Metadata (slug, name, description, pack_number)
├── Version (semver)
├── Entity Types
├── Relationship Types
├── Recommended Spaces
├── Gideon Skills
├── Rules
├── Starter Questions
└── Dashboard Configuration
```

### Seeded Pack #001

| Field | Value |
|-------|-------|
| Name | Guardian Business |
| Slug | `guardian-business` |
| Version | `1.0.0` |
| Pack number | 1 |

Entity types include: organization, person, employee, contractor, client, contact, opportunity, proposal, contract, project, policy, procedure, task.

Relationships include: EMPLOYS, ENGAGES, SERVES, CONTACT_FOR, WORKS_ON, HAS_PROJECT, HAS_CONTRACT, PROPOSED_TO, RELATES_TO, MAY_BECOME, GOVERNS, APPLIES_TO, SUPPORTS, ASSIGNED_TO, TASK_RELATES_TO.

## Ontology integration

Packs **extend** the existing Guardian Ontology Engine (`docs/GUARDIAN_ONTOLOGY_PHASE1.md`):

- Entities / relationships / evidence remain in `ontology_*` tables
- Evidence retains `document_id`, `chunk_id`, `source_type`, `source_id`, confidence
- Entity resolution: canonical name → alias → conservative fuzzy match → create
- AI relationships require evidence quotes

Existing documents are never moved or duplicated. Analysis is opt-in after install.

## Gideon integration

Installing Guardian Business enables the **Business Chief of Staff** skill (`pack_gideon_skills.prompt_addon`).

When a business Space has the Pack installed:

1. Intent router treats business questions as knowledge (and advisory as combined CoS + knowledge).
2. `buildContext` loads pack skill prompt addons into the system prompt.
3. Answers should distinguish **Known from Guardian data** vs **Gideon's recommendation**.
4. Ontology + proposals + documents + connectors remain the evidence sources.

## Security model

- Catalog: authenticated SELECT only
- Installs: `can_access_guardian_profile` / `can_manage_guardian_profile` (owner install)
- Ontology / documents / connectors keep existing RLS
- Gideon only loads Spaces the user can access
- Feature flag: `GUARDIAN_PACK_ENGINE_FLAG` (`disabled` | `admin-only` | `beta` | `enabled`), default **admin-only**

Also requires ontology for analysis:

```env
GUARDIAN_PACK_ENGINE_FLAG=admin-only
GUARDIAN_ONTOLOGY_ENABLED=true
```

## Versioning

`pack_versions` supports `1.0.0` → `1.1.0` → `2.0.0`. Installs store `pack_version_id`. Future upgrades should migrate configuration without destroying Space links (`profile_pack_spaces`).

## App code map

| Area | Path |
|------|------|
| Feature flag | `src/lib/features/packs.ts` |
| Types / catalog / install | `src/lib/packs/` |
| APIs | `src/app/api/packs/` |
| Settings UI | `src/app/settings/packs/` |
| Components | `src/components/packs/` |

## Creating a New Guardian Pack

Goal: define **Guardian Dental** (Pack #002) primarily via definitions, not a rewrite.

1. **Add a migration seed** (idempotent `insert … on conflict`) for:
   - `packs` row (`slug = 'guardian-dental'`, `pack_number = 2`)
   - `pack_versions` (`1.0.0`)
   - entity types (e.g. patient, provider, appointment, claim)
   - relationship types
   - recommended Spaces
   - Gideon skill `prompt_addon`
   - starter questions
   - dashboard cards
2. **Extend ontology allow-lists** in `src/lib/ontology/types.ts` only if new keys are needed globally (or keep pack-specific keys as free-text `entity_type` with pack validation later).
3. **Reuse** Settings → Packs UI — it loads from the catalog.
4. **Do not** create a separate app, database, or document store.
5. Optional: pack-specific extraction hints via `pack_rules.definition` jsonb.

Example sketch:

```sql
insert into public.packs (slug, name, description, pack_number, status)
values ('guardian-dental', 'Guardian Dental', '…', 2, 'available')
on conflict (slug) do update set name = excluded.name, updated_at = now();
-- then pack_versions + child definition tables for 1.0.0
```

## V1 success checklist

1. Settings → Packs shows Guardian Business  
2. Install on a business Space with recommended Space checkboxes  
3. Analyze existing knowledge (explicit)  
4. Ontology Explorer shows entities, relationships, evidence  
5. Gideon answers “Show me everything we know about Proxdose” from ontology + evidence  
6. Gideon answers “What should I follow up on?” with facts vs recommendations labeled  

## Tests

```bash
npx tsx --require ./scripts/stub-server-only.cjs --test src/lib/packs/__tests__/packs.test.ts
```

Covered: feature flag, Space reuse, relationship normalization, Gideon routing for business / advisory questions, skill prompt formatting.
