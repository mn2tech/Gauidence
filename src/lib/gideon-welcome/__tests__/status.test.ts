import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGideonWelcomeView } from "@/lib/gideon-welcome/status";
import type { GideonWelcomeSpaceStats } from "@/lib/gideon-welcome/types";

const businessStats: GideonWelcomeSpaceStats = {
  category: "business",
  profileType: "business",
  leadsNeedFollowUp: 2,
  proposalsAwaitingResponse: 1,
  recentItemsCount: 4,
  upcomingAlertsCount: 0,
  openRequestCount: 0,
  hasAnyData: true,
};

describe("gideon welcome status", () => {
  it("builds business status and actions for returning users", () => {
    const view = buildGideonWelcomeView({
      greetName: "Michael",
      spaceName: "NM2TECH",
      isNewUser: false,
      stats: businessStats,
      statusUnavailable: false,
      profileId: "profile-1",
    });

    assert.equal(view.isEmptySpace, false);
    assert.ok(view.statusItems.some((item) => item.text.includes("follow-up")));
    assert.ok(view.statusItems.some((item) => item.text.includes("awaiting")));
    assert.equal(view.actions.length, 4);
    assert.ok(view.actions.some((a) => a.label === "What needs my attention?"));
  });

  it("prefers document-derived Ask Gideon questions when available", () => {
    const view = buildGideonWelcomeView({
      greetName: "Michael",
      spaceName: "Kendall Capital",
      isNewUser: false,
      stats: {
        ...businessStats,
        leadsNeedFollowUp: 0,
        proposalsAwaitingResponse: 0,
        documentQuestions: [
          "What do we know about Kendall Capital?",
          "What services are described?",
          "What does this say about fees?",
        ],
      },
      statusUnavailable: false,
      profileId: "profile-1",
    });

    assert.ok(
      view.actions.some((a) =>
        /What do we know about Kendall Capital/i.test(a.label)
      )
    );
    assert.ok(!view.actions.some((a) => /Follow up on leads/i.test(a.label)));
    assert.ok(view.actions.some((a) => a.label === "Ask Gideon"));
  });

  it("shows empty-space messaging without zero-filled stats", () => {
    const view = buildGideonWelcomeView({
      greetName: "Sarah",
      spaceName: "Personal",
      isNewUser: true,
      stats: {
        category: "personal",
        profileType: "personal",
        leadsNeedFollowUp: 0,
        proposalsAwaitingResponse: 0,
        recentItemsCount: 0,
        upcomingAlertsCount: 0,
        openRequestCount: 0,
        hasAnyData: false,
      },
      statusUnavailable: false,
    });

    assert.equal(view.isEmptySpace, true);
    assert.equal(view.statusItems.length, 0);
    assert.ok(view.actions.some((a) => a.label === "Upload a document"));
  });

  it("falls back when status is unavailable", () => {
    const view = buildGideonWelcomeView({
      greetName: null,
      spaceName: "NM2TECH",
      isNewUser: false,
      stats: businessStats,
      statusUnavailable: true,
    });

    assert.equal(view.statusUnavailable, true);
    assert.equal(view.statusItems.length, 0);
  });
});
