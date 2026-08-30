import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardianItemsFromImportantDates } from "../fromImportantDates";

describe("guardianItemsFromImportantDates", () => {
  it("creates near-term event items from analysis dates", () => {
    const items = guardianItemsFromImportantDates({
      dates: [
        {
          label: "Summit dates",
          date: "2026-09-01",
          is_past_event: false,
          is_deadline: false,
        },
        {
          label: "Printed",
          date: "2025-01-01",
          is_past_event: true,
        },
      ],
      title: "2026 Small Business Government Contracting Summit",
      summary: "Defense Leadership Forum event in Reston, VA",
      today: "2026-08-29",
    });

    assert.equal(items.length, 1);
    assert.equal(items[0]!.type, "event");
    assert.equal(items[0]!.event_date, "2026-09-01");
    assert.equal(
      items[0]!.title,
      "2026 Small Business Government Contracting Summit"
    );
    assert.ok(items[0]!.confidence >= 0.9);
  });

  it("maps deadline flags to deadline items", () => {
    const items = guardianItemsFromImportantDates({
      dates: [
        {
          label: "Registration due",
          date: "2026-08-31",
          is_deadline: true,
        },
      ],
      today: "2026-08-29",
    });
    assert.equal(items[0]!.type, "deadline");
    assert.equal(items[0]!.due_at, "2026-08-31");
    assert.equal(items[0]!.requires_action, true);
  });

  it("parses Month Day, Year values and ignores bad past flags", () => {
    const items = guardianItemsFromImportantDates({
      dates: [
        {
          label: "Summit",
          value: "September 1–2, 2026",
          is_past_event: true,
        },
      ],
      title: "Government Contracting Summit",
      today: "2026-08-29",
    });
    assert.equal(items.length, 1);
    assert.equal(items[0]!.event_date, "2026-09-01");
  });
});
