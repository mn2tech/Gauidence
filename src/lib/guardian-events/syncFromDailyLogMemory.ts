/**
 * In-memory sync of Daily Log → guardian_events (tests / offline).
 * Mirrors syncGuardianEventsFromDailyLog accounting without Supabase.
 */

import {
  deriveGuardianEventsFromDailyLog,
  isPrimaryDailyLogEvent,
  type DailyLogForEvents,
} from "./fromDailyLog";
import type { MemoryGuardianEventStore } from "./memoryStore";

export type SyncDailyLogEventsMemoryResult = {
  created: number;
  skipped: number;
  updated: number;
  eventIds: string[];
  dailyLogMutated: false;
};

export function syncGuardianEventsFromDailyLogMemory(
  store: MemoryGuardianEventStore,
  args: {
    userId: string;
    log: DailyLogForEvents;
    createdBy?: "backfill" | "system" | "user" | "gideon";
  }
): SyncDailyLogEventsMemoryResult {
  const inputs = deriveGuardianEventsFromDailyLog({
    userId: args.userId,
    log: args.log,
    createdBy: args.createdBy ?? "system",
  });

  if (args.log.profile_id) {
    store.grantAccess(args.log.profile_id, args.userId, "editor");
  }

  let created = 0;
  let skipped = 0;
  const updated = 0;
  const eventIds: string[] = [];

  for (const input of inputs) {
    const existing = store
      .list({
        userId: args.userId,
        sourceType: "daily_log",
        sourceId: input.sourceId!,
        includeUnscoped: true,
        limit: 200,
      })
      .find((e) => e.dedupe_key === input.dedupeKey);

    if (existing) {
      eventIds.push(existing.id);
      // Title drift updates are production-only; idempotent skip still holds.
      void isPrimaryDailyLogEvent(existing.dedupe_key);
      skipped += 1;
      continue;
    }

    const result = store.create({
      ...input,
      spaceId: input.spaceId ?? args.log.profile_id,
    });
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    if (result.created) created += 1;
    else skipped += 1;
    eventIds.push(result.data.id);
  }

  return {
    created,
    skipped,
    updated,
    eventIds,
    dailyLogMutated: false,
  };
}
