/**
 * Phase 2 — Daily Log → guardian_events derivation, provenance, idempotency.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryGuardianEventStore,
  dailyLogEntryDedupeKey,
  deriveGuardianEventsFromDailyLog,
  formatGuardianEventSourceLabel,
  getGuardianEventSourceRef,
  syncGuardianEventsFromDailyLogMemory,
} from "../index.ts";

const LOG = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  profile_id: "space-personal",
  title: "Onyx meeting",
  content:
    "Met with Onyx regarding client protection.\nFollow up with John tomorrow about the proposal.",
  log_date: "2026-08-27",
  owner_user_id: "user-a",
};

describe("deriveGuardianEventsFromDailyLog", () => {
  it("always creates a primary daily_log_entry with provenance", () => {
    const inputs = deriveGuardianEventsFromDailyLog({
      userId: "user-a",
      log: LOG,
      createdBy: "backfill",
    });
    const primary = inputs.find((i) => i.eventType === "daily_log_entry");
    assert.ok(primary);
    assert.equal(primary!.sourceType, "daily_log");
    assert.equal(primary!.sourceId, LOG.id);
    assert.equal(primary!.spaceId, LOG.profile_id);
    assert.equal(primary!.dedupeKey, dailyLogEntryDedupeKey());
    assert.equal(primary!.metadata?.log_date, "2026-08-27");
    assert.match(primary!.summary ?? "", /Onyx/);
  });

  it("extracts follow-up / dated fragments from the same log", () => {
    const inputs = deriveGuardianEventsFromDailyLog({
      userId: "user-a",
      log: LOG,
    });
    assert.ok(inputs.length >= 2);
    assert.ok(
      inputs.some(
        (i) => i.eventType === "follow_up" && i.actionRequired === true
      )
    );
  });

  it("does not invent a space when profile_id is used as known context", () => {
    const inputs = deriveGuardianEventsFromDailyLog({
      userId: "user-a",
      log: { ...LOG, profile_id: "space-nm2" },
    });
    assert.ok(inputs.every((i) => i.spaceId === "space-nm2"));
    assert.ok(inputs.every((i) => (i.confidenceScore ?? 0) >= 0.9));
  });
});

describe("syncGuardianEventsFromDailyLogMemory", () => {
  it("creates events from a Daily Log and leaves the log identity untouched", () => {
    const store = createMemoryGuardianEventStore();
    const originalLog = { ...LOG };
    const result = syncGuardianEventsFromDailyLogMemory(store, {
      userId: "user-a",
      log: LOG,
      createdBy: "backfill",
    });
    assert.equal(result.dailyLogMutated, false);
    assert.ok(result.created >= 1);
    assert.deepEqual(LOG, originalLog);

    const events = store.list({
      userId: "user-a",
      sourceType: "daily_log",
      sourceId: LOG.id,
    });
    assert.ok(events.length >= 1);
    const primary = events.find((e) => e.event_type === "daily_log_entry");
    assert.ok(primary);
    assert.equal(primary!.source_id, LOG.id);
    assert.equal(
      formatGuardianEventSourceLabel(primary!),
      "Daily Log — August 27, 2026"
    );
    assert.equal(getGuardianEventSourceRef(primary!).sourceId, LOG.id);
  });

  it("is idempotent — second sync does not duplicate events", () => {
    const store = createMemoryGuardianEventStore();
    const first = syncGuardianEventsFromDailyLogMemory(store, {
      userId: "user-a",
      log: LOG,
      createdBy: "backfill",
    });
    const second = syncGuardianEventsFromDailyLogMemory(store, {
      userId: "user-a",
      log: LOG,
      createdBy: "backfill",
    });
    assert.ok(first.created >= 1);
    assert.equal(second.created, 0);
    assert.ok(second.skipped >= first.created);

    const all = store.list({
      userId: "user-a",
      sourceType: "daily_log",
      sourceId: LOG.id,
      limit: 100,
    });
    const ids = all.map((e) => e.dedupe_key).sort();
    assert.equal(ids.length, new Set(ids).size);
    assert.equal(all.length, first.eventIds.length);
  });

  it("keeps User B from seeing User A daily-log events", () => {
    const store = createMemoryGuardianEventStore();
    syncGuardianEventsFromDailyLogMemory(store, {
      userId: "user-a",
      log: LOG,
    });
    assert.equal(store.list({ userId: "user-b" }).length, 0);
    assert.ok(store.list({ userId: "user-a" }).length >= 1);
  });
});
