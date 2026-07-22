import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatWorkMemoryForGideon } from "../context.ts";
import type { WorkProject, WorkSession } from "../types.ts";

const project: WorkProject = {
  id: "p1",
  owner_user_id: "u1",
  profile_id: null,
  name: "Guardian Sprint",
  status: "in_progress",
  mission: "Finish Work Memory",
  current_step: "Testing",
  next_action: "Ship Phase 1",
  blockers: "None",
  priority: 0,
  estimated_resume_minutes: 15,
  resume_context: null,
  last_activity_at: "2026-07-21T16:12:00Z",
  last_opened_at: null,
  created_at: "2026-07-20T10:00:00Z",
  updated_at: "2026-07-21T16:12:00Z",
};

const session: WorkSession = {
  id: "s1",
  project_id: "p1",
  owner_user_id: "u1",
  started_at: null,
  ended_at: "2026-07-21T16:12:00Z",
  accomplished: "Built API routes",
  next_step: "Test UI",
  blockers: null,
  notes: null,
  created_at: "2026-07-21T16:12:00Z",
};

describe("formatWorkMemoryForGideon", () => {
  it("returns empty for no projects", () => {
    assert.equal(formatWorkMemoryForGideon([], new Map()), "");
  });

  it("includes project fields and sessions", () => {
    const map = new Map([["p1", [session]]]);
    const out = formatWorkMemoryForGideon([project], map);
    assert.match(out, /Guardian Sprint/);
    assert.match(out, /Mission: Finish Work Memory/);
    assert.match(out, /Built API routes/);
  });
});
