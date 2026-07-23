# AI Auto-Organization (Sprint 12)

Guardian can suggest where to file a document after AI analysis. Users approve before profiles, vaults, or document locations change.

## Architecture

```
Upload → analyze pipeline → runOrganizationAfterAnalysis()
  → buildOrganizationAiOutput()   (from existing GuardianAnalysis)
  → matchOrganizationTarget()     (normalized name + synonym matching)
  → organization_suggestions row  (pending)
  → OrganizationSuggestionModal   (user confirms)
  → resolveOrganizationSuggestion() → moveDocumentToProfile() / create profiles
  → organization_audit_log
```

### Guardian mapping

- **Vault** = `guardian_profiles` row (`documents.profile_id`)
- **Profile (person/context)** = person name in the suggestion (`suggested_profile_name`)
- **Topic vault** = often an `other` space under a Family container, or the person’s own profile

Nothing in the existing profile, document, Ask Gideon, or daily log flows is replaced.

## Database (migration `0037_ai_auto_organization.sql`)

| Table | Purpose |
|-------|---------|
| `organization_suggestions` | Pending/resolved recommendations per document |
| `organization_preferences` | Per-user learning by `document_type` |
| `organization_audit_log` | Accept, reject, move, undo events |
| `profiles.auto_organize_mode` | `off` \| `suggest` (default) \| `auto` |
| `profiles.auto_organize_threshold` | Auto-file threshold (default `0.85`) |
| `profiles.unorganized_profile_id` | Cached fallback vault |

RLS: users see their own rows; suggestions also respect `can_access_guardian_profile` for linked vaults.

## Settings

**Settings → AI Auto-Organize**

- **Off** — no suggestions after analysis
- **Suggest** — show recommendation card (default)
- **Automatic** — file into an existing vault when confidence ≥ threshold; undo still available

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/organization/suggestions/[id]` | Fetch suggestion payload |
| `POST` | `/api/organization/suggestions/[id]` | Resolve: `accept`, `reject`, `keep_current`, `keep_unorganized`, `create_suggested`, `undo` |

Analyze response includes `organizationSuggestion` and `organizationAutoApplied` when enabled.

## Key files

- `src/lib/organization/` — matching, run, resolve, move
- `src/components/OrganizationSuggestionModal.tsx` — recommendation UI
- `src/app/api/documents/analyze/route.ts` — hook after analysis
- `supabase/migrations/0037_ai_auto_organization.sql`

## Environment variables

No new variables. Uses existing:

- `ANTHROPIC_API_KEY` — document analysis (required for suggestions)
- `OPENAI_API_KEY` — optional vault re-indexing after move

## Unorganized fallback

`ensureUnorganizedProfile()` creates or reuses a profile named **Unorganized** when confidence is low, analysis routing fails, or the user chooses **Keep unorganized**.

## Tests

```bash
npm test
```

Covers matching scenarios: existing vault, create vault, create profile, synonym match (Books/Reading), low confidence, passport/identity.

## Apply migration

Run `supabase/migrations/0037_ai_auto_organization.sql` in the Supabase SQL editor (or via your migration workflow) before using the feature in production.
