import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calendarDateInZone,
  formatReminderWhen,
  isImminentReminder,
  zonedDateTimeToIso,
} from "../time.ts";

describe("reminder time helpers", () => {
  it("converts Eastern wall time to a stable ISO instant", () => {
    // 2026-07-16 19:00 EDT = 23:00 UTC
    const iso = zonedDateTimeToIso({
      date: "2026-07-16",
      time: "19:00",
      timeZone: "America/New_York",
    });
    assert.ok(iso);
    assert.equal(iso, "2026-07-16T23:00:00.000Z");
  });

  it("rejects bad date/time shapes", () => {
    assert.equal(
      zonedDateTimeToIso({ date: "7/16/2026", time: "19:00" }),
      null
    );
    assert.equal(
      zonedDateTimeToIso({ date: "2026-07-16", time: "7pm" }),
      null
    );
  });

  it("formats reminder when with clock time", () => {
    const label = formatReminderWhen(
      "2026-07-16T23:00:00.000Z",
      "2026-07-16",
      "America/New_York"
    );
    assert.match(label, /Jul/);
    assert.match(label, /7:00|19:00/);
  });

  it("calendarDateInZone uses the product timezone", () => {
    // Noon UTC on Jul 16 is still Jul 16 in New York
    assert.equal(
      calendarDateInZone(new Date("2026-07-16T16:00:00.000Z"), "America/New_York"),
      "2026-07-16"
    );
  });

  it("flags reminders inside the imminent window", () => {
    const now = Date.parse("2026-07-16T18:00:00.000Z");
    assert.equal(
      isImminentReminder(new Date(now + 30 * 60 * 1000).toISOString(), now),
      true
    );
    assert.equal(
      isImminentReminder(new Date(now - 30 * 60 * 1000).toISOString(), now),
      true
    );
    assert.equal(
      isImminentReminder(new Date(now + 3 * 60 * 60 * 1000).toISOString(), now),
      false
    );
    assert.equal(
      isImminentReminder(new Date(now - 3 * 60 * 60 * 1000).toISOString(), now),
      false
    );
  });
});
