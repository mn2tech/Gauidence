# Gideon Business Intelligence (Guardian Business Pack V1.1)

Guardian’s differentiation is not document search alone. V1.1 makes **Gideon reason over Guardian’s ontology and structured business data** and return synthesized business intelligence.

```text
Question
   ↓
Gideon Query Planner (internal)
   ↓
Intent → retrieval strategy
   ↓
Ontology + Structured Data + Targeted Search
   ↓
Evidence validation + claim tracking
   ↓
Reasoning
   ↓
Business Intelligence
   ↓
Recommendation / Action (labeled)
```

> Gideon should reason over Guardian knowledge, not merely repeat Guardian knowledge.

This builds on Pack Engine V1 (`docs/GUARDIAN_PACK_ENGINE.md`). It does **not** rebuild the Pack Engine and does **not** start Pack #002 (Guardian Dental).

---

## Current Gideon flow (before → after)

### Before (V1)

```text
Question → regex intent → hybrid search + ontology dump → LLM prose
```

Retrieval was largely uniform. Answers often exposed raw extracted facts and internal workflow items.

### After (V1.1)

```text
Question
  → classifyGideonIntent (existing router)
  → planBusinessQuery (Business Pack planner)
  → intent-dependent loadBusinessIntelligence
  → optional hybrid search (only when plan.requiresSearch)
  → system prompt blocks: BUSINESS INTELLIGENCE (+ ontology/proposals as needed)
  → stream answer
  → persist claims[] on vault_chat_messages
```

Plans are **internal**. Users never see intent labels like `ENTITY_360`.

---

## Query planner

Module: `src/lib/gideon/business/queryPlanner.ts`

| Intent | Example | Strategy |
|--------|---------|----------|
| `ENTITY_360` | Show me everything we know about Proxdose. | Ontology + structured + targeted evidence |
| `RELATIONSHIP_QUERY` | Which clients have proposals but no active project? / Onyx relationships | Ontology first |
| `PROPOSAL_ANALYSIS` | What proposals need follow-up? | Proposals first + follow-up scoring |
| `PROJECT_ANALYSIS` | What projects… | Ontology projects |
| `COMMITMENT_ANALYSIS` | What commitments have we made… | Commitments (+ proposal deliverables labeled by status) |
| `EVIDENCE_REQUEST` | Where did you get that information? | Prior claims only |
| `BUSINESS_STATUS` | Pipeline / overview | Structured overview |
| `ADVISORY` | What should I focus on next? | Business state + priority rank |
| `GENERAL_KNOWLEDGE` | Other | Hybrid search |

Plan shape (internal):

```json
{
  "intent": "ENTITY_360",
  "entities": ["Proxdose"],
  "requiresOntology": true,
  "requiresStructuredData": true,
  "requiresSearch": true,
  "requiresEvidence": true
}
```

---

## Retrieval strategies

Implemented in `src/lib/gideon/business/retrieve.ts`, wired from `loadWorkspaceContext`.

- **Do not** run every retrieval system for every question.
- `EVIDENCE_REQUEST` skips ontology + vector search.
- `PROPOSAL_ANALYSIS` / `ADVISORY` / `RELATIONSHIP_QUERY` prefer structured/ontology paths.
- `ENTITY_360` still allows targeted search for evidence gaps.

---

## Entity 360

`buildEntity360` / `resolveBusinessEntity` return a prioritized model:

Identity · Relationships · People · Proposals · Projects · Contracts · Assessments · Commitments · Risks · Evidence · Gaps

Gideon turns this into a concise business summary. “Everything we know” means a **comprehensive business summary**, not every extracted property. Users can drill down.

---

## Entity resolution

Enhancements in `src/lib/ontology/normalize.ts` + `resolve.ts`:

- `canonicalizeOrganizationKey` / `extractDomainHint`
- Proxdose ≈ PROXDOSE ≈ Proxdose LLC ≈ proxdose.com when unambiguous
- Domains stored on `properties.domain` and as aliases
- Ambiguous multi-matches are **not** auto-merged (reviewable path remains)

---

## Relationship reasoning

`relationshipReasoning.ts`:

- Clients with proposals but no active project (ontology `HAS_PROJECT` / `WORKS_ON` + proposals table)
- Named entity relationship traversal (e.g. Onyx)

Never invent amounts/statuses; only show values supported by Guardian data.

---

## Proposal follow-up

Configurable scoring in `proposalFollowUp.ts` (default stale = 7 days):

Signals: status sent/viewed, no work project, idle updates, follow-up date passed, no recent view, commercial value.

Returns **why** each candidate needs follow-up.

---

## Business knowledge filter

`knowledgeFilter.ts` classifies text into:

`BUSINESS_FACT` · `BUSINESS_RELATIONSHIP` · `BUSINESS_COMMITMENT` · `BUSINESS_EVENT` · `BUSINESS_RISK` · `BUSINESS_OPPORTUNITY` · `SYSTEM_METADATA` · `PROCESS_METADATA` · `LOW_VALUE`

Semantic heuristics + deterministic safeguards (not only a phrase blacklist).

Applied when:

- Formatting ontology for Gideon
- Building Entity 360
- Persisting ontology extractions entities (`persist.ts`)

Regression: “Review 118 queued documents”, “Monitor asynchronous ontology extraction”, etc. must **not** appear as Proxdose business facts.

---

## Commitments

Table: `business_commitments` (migration `0083_gideon_business_intelligence.sql`)

Statuses: `PROPOSED` · `RECOMMENDED` · `AGREED` · `COMMITTED` · `COMPLETED` · `CANCELLED` · `UNKNOWN`

A proposal deliverable is **PROPOSED** until the proposal is accepted (`AGREED`). Do not treat every sentence as a commitment.

---

## Claims / evidence

- Claims generated during BI retrieval
- Stored on `vault_chat_messages.claims` (jsonb)
- “Where did you get that?” reads the **previous assistant message’s claims** — no new broad search

---

## Advisory / chief-of-staff

`advisory.ts` ranks:

proposals needing follow-up · commitments due · unresolved risks · missing information

Internal score ≈ urgency × business impact × confidence.

Answers must separate:

- **Known from Guardian**
- **Gideon recommendation**

Suggested future actions are listed as labels only (`Draft Follow-Up`, `Create Task`, …) — full action automation is V1.2.

---

## Insights foundation (V1.2-ready)

Table: `business_insights` — org-scoped, RLS via `can_access_guardian_profile` / manage.

V1.1 generates advisory insights on demand. Automatic notifications wait for V1.2.

---

## Security

All new tables respect Space RLS:

- `business_commitments.organization_id` → `guardian_profiles`
- `business_insights.organization_id` → `guardian_profiles`
- Claims inherit vault chat RLS (message owner)

Gideon only loads Spaces the user can access. Ontology evidence from inaccessible documents should not leak via restricted relationships (existing ontology RLS + Space scoping).

---

## Observability

`logBusinessIntelligenceTrace` logs structured decisions in development (or `GIDEON_BI_DEBUG=1`):

question → intent → entities → strategy → hit counts → claims generated

No hidden chain-of-thought is stored.

---

## UI

Business answers use markdown sections Gideon already renders in Ask Gideon:

Entity Summary · Relationships · Proposals · Projects · Commitments · Risks · Recommendations · Sources

No separate Gideon UI. Pack quick actions / starter questions updated for the seven acceptance prompts.

---

## Testing

```bash
npx tsx --require ./scripts/stub-server-only.cjs --test src/lib/gideon/business/__tests__/businessIntelligence.test.ts
npx tsx --require ./scripts/stub-server-only.cjs --test src/lib/packs/__tests__/packs.test.ts
```

Acceptance questions (with seeded Proxdose / Onyx / proposals data):

1. Entity 360 summary (not raw dump)
2. Clients with proposals, no active project
3. Ranked proposal follow-ups with reasons
4. Onyx relationships with evidence
5. Commitments grouped; PROPOSED vs AGREED
6. Evidence from prior claims
7. Ranked focus priorities with Why / Evidence / Confidence / Next step

---

## Code map

| Area | Path |
|------|------|
| Planner / filter / Entity 360 / retrieve | `src/lib/gideon/business/` |
| Context wiring | `src/lib/workspace-context/buildContext.ts` |
| Prompt assembly | `src/lib/workspace-context/formatSystemPrompt.ts` |
| Pack skill text | `src/lib/packs/gideon.ts` |
| Migration | `supabase/migrations/0083_gideon_business_intelligence.sql` |
| Pack version constant | `GUARDIAN_BUSINESS_PACK_VERSION = "1.1.0"` |

---

## Extension points for V1.2

- Persist `business_insights` on a schedule; notify owners
- Execute suggested actions with human approval
- Draft follow-up emails / create tasks / reminders
- Then industry Pack #002 (Guardian Dental) — see `docs/GUARDIAN_PACK_ENGINE.md` and migration `0084_guardian_dental_pack.sql`
