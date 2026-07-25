import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calendarDateInUserZone,
  detectBrowserTimeZone,
  formatGuardianTimeLabel,
  formatGuardianTodayLabel,
  guardianTimeZoneLabel,
  isValidIanaTimeZone,
} from "../timezone.ts";

describe("timezone helpers", () => {
  it("validates IANA zones", () => {
    assert.equal(isValidIanaTimeZone("Asia/Kolkata"), true);
    assert.equal(isValidIanaTimeZone("Not/AZone"), false);
  });

  it("formats today in India", () => {
    const label = formatGuardianTodayLabel(
      new Date("2026-07-25T15:00:00+05:30"),
      "Asia/Kolkata"
    );
    assert.match(label, /Saturday, July 25, 2026/);
    assert.match(guardianTimeZoneLabel("Asia/Kolkata"), /India/i);
  });

  it("formats clock time in a zone", () => {
    const time = formatGuardianTimeLabel(
      new Date("2026-07-25T15:00:00-04:00"),
      "America/New_York"
    );
    assert.equal(time, "3:00 PM");
  });

  it("calendar date respects zone boundaries", () => {
    const date = calendarDateInUserZone(
      new Date("2026-07-26T02:30:00Z"),
      "Asia/Kolkata"
    );
    assert.equal(date, "2026-07-26");
  });

  it("detectBrowserTimeZone returns a valid zone or default", () => {
    const tz = detectBrowserTimeZone();
    assert.equal(isValidIanaTimeZone(tz), true);
  });
});
