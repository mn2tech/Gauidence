import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createCalendarEvent,
  findAvailableTime,
  formatCalendarToolNote,
  getCalendarEvents,
  resetCalendarProvider,
  updateCalendarEvent,
} from "../tools/calendar/service.ts";

afterEach(() => {
  resetCalendarProvider();
});

describe("Calendar service", () => {
  it("reads as not connected in Phase 1", async () => {
    const result = await getCalendarEvents({
      start: new Date("2026-08-14T00:00:00Z"),
      end: new Date("2026-08-15T00:00:00Z"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.connected, false);
    assert.equal(result.reason, "not_connected");
  });

  it("finds no availability when disconnected", async () => {
    const result = await findAvailableTime({
      durationMinutes: 90,
      range: {
        start: new Date("2026-08-15T00:00:00Z"),
        end: new Date("2026-08-16T00:00:00Z"),
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_connected");
  });

  it("refuses to create an event without confirmation", async () => {
    const result = await createCalendarEvent({
      input: {
        title: "Guardian Focus Time",
        start: new Date("2026-08-15T13:30:00Z"),
        end: new Date("2026-08-15T15:00:00Z"),
      },
      confirmed: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "confirmation_required");
  });

  it("still does not create after confirmation when no provider is connected", async () => {
    const result = await createCalendarEvent({
      input: {
        title: "Guardian Focus Time",
        start: new Date("2026-08-15T13:30:00Z"),
        end: new Date("2026-08-15T15:00:00Z"),
      },
      confirmed: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_connected");
  });

  it("refuses updates without confirmation", async () => {
    const result = await updateCalendarEvent({
      id: "evt-1",
      input: { title: "Moved focus block" },
      confirmed: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "confirmation_required");
  });

  it("formats an unconnected calendar note without inventing meetings", () => {
    const note = formatCalendarToolNote({
      ok: false,
      connected: false,
      reason: "not_connected",
      events: [],
    });
    assert.match(note, /No external calendar is connected/i);
    assert.match(note, /Do not invent meetings/);
  });
});
