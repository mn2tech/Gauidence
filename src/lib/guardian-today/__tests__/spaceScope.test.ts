import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GuardianWatchItem } from "@/lib/guardian-items/types";
import { scoreWatchItem } from "../scoring";
import {
  TODAY_GROUP_LIMIT,
  groupScoredByRootSpace,
  restrictToAuthorized,
  rootSpaceId,
  spaceIdsUnderRoot,
  spaceScopeMap,
  type SpaceScopeProfile,
} from "../spaceScope";

function profile(
  overrides: Partial<SpaceScopeProfile> & Pick<SpaceScopeProfile, "id">
): SpaceScopeProfile {
  return {
    display_name: overrides.display_name ?? overrides.id,
    profile_type: overrides.profile_type ?? "other",
    parent_profile_id: overrides.parent_profile_id ?? null,
    ...overrides,
  };
}

function watchItem(
  overrides: Partial<GuardianWatchItem> &
    Pick<GuardianWatchItem, "id" | "space_id">
): GuardianWatchItem {
  return {
    user_id: "user-1",
    child_id: null,
    school_context_id: null,
    type: "deadline",
    title: overrides.title ?? "Item",
    description: null,
    event_date: "2026-09-12",
    start_at: null,
    end_at: null,
    due_at: null,
    remind_at: null,
    status: "active",
    priority: "normal",
    requires_action: true,
    action_label: null,
    action_url: null,
    source_type: "document",
    source_id: "doc-1",
    source_document_id: "doc-1",
    source_excerpt: null,
    source_page: null,
    confidence: 0.9,
    needs_review: false,
    extraction_version: "v1",
    dedupe_key: overrides.id,
    created_at: "2026-09-07T12:00:00.000Z",
    updated_at: "2026-09-07T12:00:00.000Z",
    completed_at: null,
    dismissed_at: null,
    space_name: null,
    child_name: null,
    effective_date: "2026-09-12",
    ...overrides,
  };
}

function score(item: GuardianWatchItem) {
  return scoreWatchItem({
    item,
    today: "2026-09-08",
    now: new Date("2026-09-08T12:00:00.000Z"),
  });
}

const profiles = spaceScopeMap([
  profile({
    id: "personal",
    display_name: "Personal",
    profile_type: "personal",
  }),
  profile({
    id: "business",
    display_name: "Business",
    profile_type: "business",
  }),
  profile({
    id: "client",
    display_name: "Acme",
    profile_type: "client",
    parent_profile_id: "business",
  }),
  profile({
    id: "family",
    display_name: "Family",
    profile_type: "family",
  }),
]);

describe("Guardian Today space scope", () => {
  it("walks nested client spaces up to Business", () => {
    assert.equal(rootSpaceId("client", profiles), "business");
    assert.equal(rootSpaceId("personal", profiles), "personal");
  });

  it("includes nested spaces when filtering to Business", () => {
    const ids = spaceIdsUnderRoot("business", profiles);
    assert.ok(ids.includes("business"));
    assert.ok(ids.includes("client"));
    assert.ok(!ids.includes("personal"));
  });

  it("does not leak unauthorized space ids", () => {
    assert.deepEqual(
      restrictToAuthorized(["business", "secret"], ["personal", "business"]),
      ["business"]
    );
  });

  it("keeps Personal and Business priorities in separate groups", () => {
    const grouped = groupScoredByRootSpace(
      [
        score(
          watchItem({
            id: "p1",
            space_id: "personal",
            space_name: "Personal",
            title: "Insurance renewal",
            type: "renewal",
            effective_date: "2026-09-20",
          })
        ),
        score(
          watchItem({
            id: "b1",
            space_id: "business",
            space_name: "Business",
            title: "Proposal deadline",
            effective_date: "2026-09-12",
          })
        ),
      ],
      profiles
    );

    const names = grouped.map((g) => g.profile?.display_name);
    assert.ok(names.includes("Personal"));
    assert.ok(names.includes("Business"));
    const business = grouped.find((g) => g.rootId === "business");
    const personal = grouped.find((g) => g.rootId === "personal");
    assert.equal(business?.items[0]?.title, "Proposal deadline");
    assert.equal(personal?.items[0]?.title, "Insurance renewal");
  });

  it("rolls a client item up under Business", () => {
    const grouped = groupScoredByRootSpace(
      [
        score(
          watchItem({
            id: "c1",
            space_id: "client",
            space_name: "Acme",
            title: "Client follow-up",
            type: "follow_up",
            effective_date: "2026-09-10",
          })
        ),
      ],
      profiles
    );
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]!.rootId, "business");
    assert.equal(grouped[0]!.items[0]!.title, "Client follow-up");
  });

  it("does not let Personal crowd Business out of Today's list", () => {
    const personalItems = Array.from({ length: 6 }, (_, i) =>
      score(
        watchItem({
          id: `p${i}`,
          space_id: "personal",
          space_name: "Personal",
          title: `Personal task ${i}`,
          type: "task",
          effective_date: "2026-09-09",
          requires_action: true,
        })
      )
    );
    const businessItem = score(
      watchItem({
        id: "b-urgent",
        space_id: "business",
        space_name: "Business",
        title: "Treasury opportunity",
        effective_date: "2026-09-20",
        requires_action: true,
        type: "deadline",
      })
    );

    const grouped = groupScoredByRootSpace(
      [...personalItems, businessItem],
      profiles,
      TODAY_GROUP_LIMIT
    );
    const business = grouped.find((g) => g.rootId === "business");
    const personal = grouped.find((g) => g.rootId === "personal");
    assert.ok(business, "Business still has a slot");
    assert.equal(business!.items[0]!.title, "Treasury opportunity");
    assert.equal(personal!.items.length, TODAY_GROUP_LIMIT);
  });
});
