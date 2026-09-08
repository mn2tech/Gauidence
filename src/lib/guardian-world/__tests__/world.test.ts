/**
 * Phase 4 — My World card aggregation helpers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateStatsForSpaces,
  buildWorldCard,
  countsToMap,
  emptyWorldStats,
  filterAuthorizedWorldCards,
  formatWorldSummaryLine,
  sortWorldCards,
} from "../index.ts";
import type { WorldCard } from "../types.ts";

function card(partial: Partial<WorldCard> & Pick<WorldCard, "spaceId" | "name">): WorldCard {
  const stats = { ...emptyWorldStats(), ...partial.stats };
  return buildWorldCard({
    spaceId: partial.spaceId,
    name: partial.name,
    description: partial.description ?? null,
    profileType: partial.profileType ?? "other",
    typeLabel: partial.typeLabel ?? "Other",
    peoplePreview: partial.peoplePreview ?? [],
    updatedAt: partial.updatedAt ?? null,
    stats,
  });
}

describe("My World card helpers", () => {
  it("formats summary with open actions and deadlines first", () => {
    assert.match(
      formatWorldSummaryLine({
        ...emptyWorldStats(),
        openActionCount: 2,
        upcomingDeadlineCount: 1,
      }),
      /2 open actions · 1 upcoming deadline/
    );
  });

  it("aggregates nested space items and docs onto one card", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    const stats = aggregateStatsForSpaces({
      spaceIds: ["root", "child"],
      items: [
        {
          spaceId: "child",
          title: "Send demo",
          status: "active",
          requiresAction: true,
          dueAt: "2026-09-10T12:00:00.000Z",
          eventDate: null,
          type: "follow_up",
          updatedAt: "2026-09-07T12:00:00.000Z",
        },
        {
          spaceId: "root",
          title: "Old done",
          status: "completed",
          requiresAction: true,
          dueAt: null,
          eventDate: null,
          type: "task",
          updatedAt: "2026-09-01T12:00:00.000Z",
        },
      ],
      activities: [
        {
          spaceId: "root",
          title: "Met Clark",
          at: "2026-09-07T18:00:00.000Z",
        },
      ],
      documentCounts: countsToMap([
        { spaceId: "root", count: 3 },
        { spaceId: "child", count: 1 },
      ]),
      logCounts: countsToMap([{ spaceId: "root", count: 2 }]),
      linkedPeopleCount: 1,
      profileUpdatedAt: "2026-09-01T00:00:00.000Z",
      now,
      horizonDays: 30,
    });
    assert.equal(stats.itemCount, 1);
    assert.equal(stats.openActionCount, 1);
    assert.equal(stats.upcomingDeadlineCount, 1);
    assert.equal(stats.documentCount, 4);
    assert.equal(stats.logCount, 2);
    assert.equal(stats.recentActivityTitle, "Met Clark");
    assert.equal(stats.lastUpdatedAt, "2026-09-07T18:00:00.000Z");
  });

  it("sorts cards needing attention first", () => {
    const sorted = sortWorldCards([
      card({ spaceId: "a", name: "Quiet", stats: emptyWorldStats() }),
      card({
        spaceId: "b",
        name: "Busy",
        stats: { ...emptyWorldStats(), openActionCount: 3 },
      }),
    ]);
    assert.equal(sorted[0]!.spaceId, "b");
  });

  it("filters out unauthorized space cards", () => {
    const cards = [
      card({ spaceId: "mine", name: "Mine" }),
      card({ spaceId: "theirs", name: "Theirs" }),
    ];
    const filtered = filterAuthorizedWorldCards(cards, new Set(["mine"]));
    assert.deepEqual(
      filtered.map((c) => c.spaceId),
      ["mine"]
    );
  });
});
