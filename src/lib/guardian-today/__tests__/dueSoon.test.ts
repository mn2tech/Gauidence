import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMMINENT_LOOKAHEAD_MS,
  IMMINENT_OVERDUE_MS,
} from "../../reminders/time";
import { dueSoonWindowIso, isDueSoonInstant } from "../dueSoon";

describe("dueSoon", () => {
  it("builds window from imminent constants", () => {
    const now = Date.parse("2026-08-30T20:00:00.000Z");
    const { fromIso, toIso } = dueSoonWindowIso(now);
    assert.equal(
      fromIso,
      new Date(now - IMMINENT_OVERDUE_MS).toISOString()
    );
    assert.equal(
      toIso,
      new Date(now + IMMINENT_LOOKAHEAD_MS).toISOString()
    );
  });

  it("flags instants inside the window", () => {
    const now = Date.parse("2026-08-30T20:00:00.000Z");
    assert.equal(
      isDueSoonInstant(new Date(now + 30 * 60_000).toISOString(), now),
      true
    );
    assert.equal(
      isDueSoonInstant(new Date(now + 3 * 60 * 60_000).toISOString(), now),
      false
    );
  });
});
