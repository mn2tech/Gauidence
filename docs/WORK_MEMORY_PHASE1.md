# Work Memory — Phase 1 Spec

**Status:** Draft for implementation  
**North star:** Guardian remembers your active intentions (mission, step, blocker, next action) and the last time you closed a work session — so you never reopen the app wondering why.

This document scopes **Phase 1 only**. Parking Lot, auto timeline, morning/evening rituals, smart suggestions, and deep resume are deferred to later phases (see [Roadmap](#roadmap)).

---

## Problem

Users store documents, daily logs, and chat with Gideon — but when they return they must reconstruct context: what they were trying to do, where they stopped, and what to do next.

## Solution (Phase 1)

A **Work Memory** area with user-owned **projects**, each holding structured work state and a history of **work sessions** (manual end-of-session capture). Gideon can read project + session context to answer continuity questions.

---

## Relationship to existing Guardian concepts

| Concept | Role today | Work Memory relationship |
|--------|------------|---------------------------|
| **Guardian profile** (`guardian_profiles`) | Vault container (family, business, client, pet, etc.) | Optional link: a project may reference one `profile_id` for related docs/logs/chats |
| **Daily Log** | Journal / narrative for a calendar day | Complementary: logs are *what happened*; projects are *what you're trying to finish* |
| **Vault / documents** | Stored files per profile | Linked later via `profile_id`; no auto-association in Phase 1 |
| **Gideon chat** | Q&A over vault + logs | Phase 1: inject active project fields + last session into context when user asks from Work Memory |

**Rule:** Projects are **user-level** (`owner_user_id`). Optional `profile_id` connects a project to a vault when work is vault-specific (e.g. "State Farm demo" → business profile).

---

## Navigation (Phase 1)

Add one signed-in route:

- **`/work-memory`** — list of active projects + create project

Do **not** add separate top-level "Projects" or "Parking Lot" nav yet. Project detail lives at `/work-memory/[projectId]`.

Existing nav unchanged: Dashboard, Vault (dashboard), Ask, Research, Settings.

---

## User flows

### 1. Work Memory dashboard (`/work-memory`)

Card per project where `status` is not `archived`:

- Name
- Status: `in_progress` | `waiting` | `blocked` | `done`
- Current mission (short headline)
- Current step
- Next action
- Blockers (optional, one line or bullet list in UI)
- Last activity (from `last_activity_at` or latest session)
- **Resume** → project detail page

Empty state: "Start a project" CTA with short explanation.

### 2. Project detail (`/work-memory/[id]`)

**"You stopped here"** banner when a prior session exists:

- Last session summary (accomplished, next step, blockers, notes)
- Current mission / step / next action (editable inline or via edit form)

Sections (Phase 1 — mostly manual links, not auto-aggregated):

- **Recent sessions** — list last 10 `work_sessions`, newest first
- **Linked vault** — if `profile_id` set, link to `/dashboard#...` for that profile
- **Open in Gideon** — `/ask` with query hint or future `?project=` param

Actions:

- **Continue working** — sets `last_opened_at`, navigates to linked dashboard profile or stays on detail
- **Update progress** — inline edit mission / step / next action / blockers / status
- **End session** — opens modal (see below)
- **Finish mission** — sets status `done`, optional final session note

### 3. End session (modal)

Triggered by explicit **End session** button — **never** block navigation or tab close.

Fields (target &lt; 20 seconds, all optional except encouraged next step):

1. **What did you accomplish?** (`accomplished` text)
2. **Next step** (`next_step` text) — pre-filled from project `next_action`
3. **Anything blocking you?** (`blockers` text)
4. **Additional notes** (`notes` text)

On save:

- Insert `work_sessions` row
- Update project: `mission`, `current_step`, `next_action`, `blockers`, `last_activity_at`, `status` if user changed it
- Store optional `resume_context` JSON (Phase 1 minimal: `{ "path": "/work-memory/[id]" }` only)

Skippable: **Cancel** closes without saving.

### 4. Resume

Phase 1 resume = open project detail with session banner + current fields. **Not** deep link to document scroll position or chat thread (Phase 5).

---

## Gideon (Phase 1)

When user is on Work Memory pages or asks continuity questions, include in system/context:

- All non-archived projects: name, status, mission, step, next action, blockers, `last_activity_at`
- Last 3 sessions per active project (accomplished, next_step, blockers, notes, `ended_at`)

Supported queries (manual test checklist):

- "What was I working on yesterday?"
- "What projects are blocked?"
- "What should I work on first?"
- "Summarize my active projects."

No new embedding index in Phase 1 — structured context only.

---

## Database

Migration: `0035_work_memory.sql`

### `work_projects`

```sql
create table public.work_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid references public.guardian_profiles (id) on delete set null,
  name text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'waiting', 'blocked', 'done', 'archived')),
  mission text,
  current_step text,
  next_action text,
  blockers text,
  priority smallint not null default 0,
  estimated_resume_minutes smallint,
  resume_context jsonb,
  last_activity_at timestamptz,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes: `(owner_user_id, status, last_activity_at desc)`, `(owner_user_id, updated_at desc)`.

RLS: owner CRUD on `owner_user_id = auth.uid()`. `profile_id` must pass `owns_guardian_profile(profile_id)` when set.

### `work_sessions`

```sql
create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.work_projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz not null default now(),
  accomplished text,
  next_step text,
  blockers text,
  notes text,
  created_at timestamptz not null default now()
);
```

Indexes: `(project_id, ended_at desc)`, `(owner_user_id, ended_at desc)`.

RLS: owner CRUD matching project ownership.

---

## API routes (Phase 1)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/work-memory/projects` | List projects for user |
| POST | `/api/work-memory/projects` | Create project |
| GET | `/api/work-memory/projects/[id]` | Project + recent sessions |
| PATCH | `/api/work-memory/projects/[id]` | Update fields / status |
| POST | `/api/work-memory/projects/[id]/sessions` | End session |
| DELETE | `/api/work-memory/projects/[id]` | Archive or hard delete (prefer `status = archived`) |

Auth: Supabase session; use existing server client patterns.

---

## UI components (new)

- `WorkMemoryPage` — project grid
- `WorkProjectCard` — dashboard card
- `WorkProjectDetail` — detail + session banner
- `EndSessionModal` — end session form
- `WorkProjectForm` — create / edit name, mission, optional profile link

Styling: match existing Guardian light theme (stone borders, brand purple accents). Dark mode is out of scope for Phase 1.

---

## Out of scope (Phase 1)

- Parking Lot
- Auto activity timeline
- Morning briefing / daily shutdown screens
- Push/email for stale projects (7-day nudge)
- SMS
- Deep resume (exact document, chat thread, scroll position)
- Auto-infer project from uploads or chats
- Billing limits on project count (unlimited for all plans initially)
- Separate "Projects" nav item

---

## Roadmap

| Phase | Focus |
|-------|--------|
| **1** | Projects + sessions + Work Memory UI + Gideon structured context |
| **2** | Morning briefing on dashboard (yesterday sessions, suggested priorities) |
| **3** | Parking Lot (inbox → project or task) |
| **4** | Activity timeline (emit events; require active project or tag at capture) |
| **5** | Deep resume + smart suggestions + notifications |

---

## Success metrics (Phase 1)

- % of weekly active users with ≥ 1 active project
- End sessions saved per user per week
- Resume / project detail views per week
- Gideon continuity questions answered without "I don't know" (qualitative QA)

---

## Implementation order

1. Migration `0035_work_memory.sql`
2. `src/lib/work-memory/` — types, validators, server helpers
3. API routes
4. `/work-memory` pages + components
5. Site header link (signed-in): "Work Memory"
6. Gideon context hook in `src/lib/chat/context.ts` (or dedicated `workMemoryContext.ts`)
7. Manual QA checklist

---

## Open questions (resolve before build)

1. **Archive vs delete** — recommend soft archive only in UI; no hard delete in v1.
2. **Free plan** — cap at 3 active projects or unlimited? Default: unlimited until usage data exists.
3. **Profile picker** — reuse `ProfileSwitcher` list or settings profiles API.

---

## Reference

Original vision doc: user prompt "Guardian Work Memory (Continue Where I Left Off)" — full vision retained for Phases 2–5.
