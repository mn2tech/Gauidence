import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGideonThinkingSteps } from "../thinkingSteps.ts";
import type { WorkspaceContextMeta } from "@/lib/workspace-context/types";

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
  scopedProfile: null,
  profileKind: "business",
  chatContextLabel: "NM2TECH business vault",
  vaultScopeNote: "scope",
};

describe("buildGideonThinkingSteps", () => {
  it("includes workspace search step for vault queries", () => {
    const steps = buildGideonThinkingSteps({
      actionCtx: {
        question: "find my passport",
        userId: "u1",
        activeProfile: meta.activeProfile,
      },
      meta,
    });
    assert.ok(steps.some((s) => s.includes("Searching NM2TECH")));
    assert.ok(steps.includes("Preparing answer"));
  });
});
