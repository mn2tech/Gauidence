import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderMorningBriefEmail } from "@/lib/email";
import {
  buildMorningPriorities,
  isMorningBriefWindow,
  MORNING_BRIEF_LOCAL_HOUR,
} from "@/lib/guardian-today/morningBrief";
import { calendarDateInUserZone, hourInUserZone } from "@/lib/timezone";

describe("morning brief email", () => {
  it("renders Gideon morning copy and priorities", () => {
    const { subject, html, text } = renderMorningBriefEmail({
      to: "user@example.com",
      greetName: "Kola",
      priorities: [
        {
          title: "Auto insurance renews",
          detail: "Today · Personal",
          url: "https://example.com/home",
        },
        {
          title: "Proposal deadline",
          detail: "3 days · Business",
          url: "https://example.com/home",
        },
      ],
      homeUrl: "https://example.com/home",
      todayLabel: "Wednesday, September 2",
    });

    assert.match(subject, /Good morning · 2 priorities/i);
    assert.match(html, /Good morning, Kola/);
    assert.match(html, /Gideon checked your Spaces/);
    assert.match(html, /Auto insurance renews/);
    assert.match(text, /Open Today's priorities/);
  });
});

describe("isMorningBriefWindow", () => {
  it("is true at local hour 7 when not yet sent today", () => {
    // 2026-09-02 11:05 UTC = 07:05 America/New_York (EDT)
    const now = new Date("2026-09-02T11:05:00.000Z");
    assert.equal(hourInUserZone(now, "America/New_York"), MORNING_BRIEF_LOCAL_HOUR);
    assert.equal(
      isMorningBriefWindow({
        now,
        timeZone: "America/New_York",
        sentOn: null,
      }),
      true
    );
  });

  it("is false when already sent on that local calendar day", () => {
    const now = new Date("2026-09-02T11:05:00.000Z");
    const today = calendarDateInUserZone(now, "America/New_York");
    assert.equal(
      isMorningBriefWindow({
        now,
        timeZone: "America/New_York",
        sentOn: today,
      }),
      false
    );
  });

  it("is false outside the morning hour", () => {
    // 15:00 UTC = 11:00 ET
    const now = new Date("2026-09-02T15:00:00.000Z");
    assert.notEqual(hourInUserZone(now, "America/New_York"), MORNING_BRIEF_LOCAL_HOUR);
    assert.equal(
      isMorningBriefWindow({
        now,
        timeZone: "America/New_York",
        sentOn: null,
      }),
      false
    );
  });
});

describe("buildMorningPriorities", () => {
  it("includes today and needs-attention items with space names", () => {
    const lines = buildMorningPriorities({
      items: [
        {
          id: "1",
          title: "Auto insurance renews",
          type: "renewal",
          priority: "high",
          requires_action: true,
          event_date: "2026-09-02",
          due_at: null,
          space_id: "space-personal",
        },
        {
          id: "2",
          title: "Far-off conference",
          type: "event",
          priority: "low",
          requires_action: false,
          event_date: "2026-12-01",
          due_at: null,
          space_id: "space-biz",
        },
        {
          id: "3",
          title: "Invoice overdue",
          type: "payment",
          priority: "critical",
          requires_action: true,
          event_date: "2026-08-20",
          due_at: null,
          space_id: "space-biz",
        },
      ],
      today: "2026-09-02",
      timeZone: "America/New_York",
      spaceNames: new Map([
        ["space-personal", "Personal"],
        ["space-biz", "Business"],
      ]),
    });

    assert.equal(lines.length, 2);
    assert.equal(lines[0]!.title, "Auto insurance renews");
    assert.equal(lines[0]!.spaceName, "Personal");
    assert.equal(lines[1]!.title, "Invoice overdue");
    assert.equal(lines[1]!.spaceName, "Business");
    assert.match(lines[1]!.detail, /overdue/i);
  });
});
