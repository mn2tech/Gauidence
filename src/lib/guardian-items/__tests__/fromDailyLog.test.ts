import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractEventsFromDailyLog,
  parseEventDateFromText,
} from "../fromDailyLog";

describe("daily log → guardian events", () => {
  it("parses Friday, August 28, 2026 from prayer breakfast log", () => {
    const date = parseEventDateFromText(
      "Friday, August 28, 2026 — Washington Government & Technology Leadership Prayer Breakfast",
      "2026-08-27"
    );
    assert.equal(date, "2026-08-28");
  });

  it("extracts Event: line with date from Daily Log body", () => {
    const events = extractEventsFromDailyLog({
      id: "log-1",
      profile_id: "space-wca",
      title:
        "Washington Gov & Technology Leadership Prayer Breakfast — Friday, August 28",
      content:
        "Event: Washington Government & Technology Leadership Prayer Breakfast\nFriday, August 28, 2026 — 7:30 AM",
      log_date: "2026-08-27",
    });
    assert.ok(events.length >= 1);
    const event = events[0]!;
    assert.equal(event.type, "event");
    assert.equal(event.eventDate, "2026-08-28");
    assert.match(event.title, /Prayer Breakfast/i);
    assert.equal(event.requiresAction, false);
  });

  it("treats tomorrow relative to log_date", () => {
    assert.equal(
      parseEventDateFromText("Follow up with John tomorrow", "2026-08-27"),
      "2026-08-28"
    );
  });

  it("extracts follow-up deadlines as actionable items", () => {
    const events = extractEventsFromDailyLog({
      id: "log-2",
      profile_id: "space-1",
      title: "Client follow-up",
      content: "Follow up with John tomorrow about the proposal.",
      log_date: "2026-08-27",
    });
    assert.ok(events.some((e) => e.type === "follow_up" && e.requiresAction));
    assert.ok(events.some((e) => e.eventDate === "2026-08-28"));
  });

  it("returns nothing for undated casual notes", () => {
    const events = extractEventsFromDailyLog({
      id: "log-3",
      profile_id: "space-1",
      title: "Random thought",
      content: "I like coffee.",
      log_date: "2026-08-27",
    });
    assert.equal(events.length, 0);
  });
});
