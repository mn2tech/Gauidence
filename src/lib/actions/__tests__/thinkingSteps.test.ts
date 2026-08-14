import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGideonThinkingSteps } from "../thinkingSteps.ts";
import type { WorkspaceContextMeta } from "@/lib/workspace-context/types";
import { classifyGideonIntent } from "@/lib/gideon/intent";

const meta: WorkspaceContextMeta = {
  activeProfile: {
    id: "p1",
    display_name: "NM2TECH",
    profile_type: "business",
    parent_profile_id: null,
  },
  retrievalScopes: [{ id: "p1", display_name: "NM2TECH", profile_type: "business" }],
  accessibleProfiles: [],
  profileNames: { p1: "NM2TECH" },
  searchProfileIds: ["p1"],
  chatHomeProfileId: "p1",
  chatScopedProfileId: null,
  searchScope: "workspace",
  scopedProfile: null,
  profileKind: "business",
  chatContextLabel: "NM2TECH business vault",
  vaultScopeNote: "scope",
};

describe("buildGideonThinkingSteps", () => {
  it("uses Searching Guardian for knowledge questions", () => {
    const route = classifyGideonIntent({
      question: "What does the uploaded employee handbook say about PTO?",
    });
    const steps = buildGideonThinkingSteps({
      actionCtx: {
        question: "What does the uploaded employee handbook say about PTO?",
        userId: "u1",
        activeProfile: meta.activeProfile,
      },
      meta,
      route,
    });
    assert.ok(steps.includes("Searching Guardian..."));
    assert.ok(!steps.some((s) => /RAG|vector|routing/i.test(s)));
  });

  it("does not claim a Guardian search for conversation", () => {
    const route = classifyGideonIntent({
      question: "What is the Pomodoro technique?",
    });
    const steps = buildGideonThinkingSteps({
      actionCtx: {
        question: "What is the Pomodoro technique?",
        userId: "u1",
        activeProfile: meta.activeProfile,
      },
      meta,
      route,
    });
    assert.deepEqual(steps, ["Thinking..."]);
  });
});
