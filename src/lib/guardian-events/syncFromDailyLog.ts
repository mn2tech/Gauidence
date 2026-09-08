/**
 * Sync / backfill guardian_events from daily_logs (non-destructive).
 * daily_logs rows are never modified or deleted.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveGuardianEventsFromDailyLog,
  isPrimaryDailyLogEvent,
  type DailyLogForEvents,
} from "./fromDailyLog";
import { createGuardianEvent } from "./repository";

export type SyncDailyLogEventsResult = {
  created: number;
  skipped: number;
  updated: number;
  eventIds: string[];
  /** Always false — Phase 2 never mutates daily_logs. */
  dailyLogMutated: false;
};

const LOG_SELECT =
  "id, owner_user_id, profile_id, log_date, title, content, created_at";

/**
 * Ensure guardian_events exist for one Daily Log.
 * Idempotent: re-running skips existing source+dedupe rows (may refresh primary).
 */
export async function syncGuardianEventsFromDailyLog(
  supabase: SupabaseClient,
  args: {
    userId: string;
    log: DailyLogForEvents;
    createdBy?: "backfill" | "system" | "user" | "gideon";
  }
): Promise<SyncDailyLogEventsResult> {
  const inputs = deriveGuardianEventsFromDailyLog({
    userId: args.userId,
    log: args.log,
    createdBy: args.createdBy ?? "system",
  });

  let created = 0;
  let skipped = 0;
  let updated = 0;
  const eventIds: string[] = [];

  for (const input of inputs) {
    const sourceId = input.sourceId!;
    const dedupeKey = input.dedupeKey!;

    const { data: existing } = await supabase
      .from("guardian_events")
      .select(
        "id, title, summary, occurred_at, metadata, dedupe_key, created_at"
      )
      .eq("user_id", args.userId)
      .eq("source_type", "daily_log")
      .eq("source_id", sourceId)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (existing) {
      eventIds.push(String(existing.id));
      if (
        isPrimaryDailyLogEvent(String(existing.dedupe_key)) &&
        (existing.title !== input.title ||
          (existing.summary ?? null) !== (input.summary ?? null) ||
          existing.occurred_at !== (input.occurredAt ?? existing.occurred_at))
      ) {
        const { error } = await supabase
          .from("guardian_events")
          .update({
            title: input.title,
            summary: input.summary ?? null,
            occurred_at: input.occurredAt ?? existing.occurred_at,
            metadata: {
              ...(typeof existing.metadata === "object" && existing.metadata
                ? (existing.metadata as Record<string, unknown>)
                : {}),
              ...(input.metadata ?? {}),
              log_date: args.log.log_date,
            },
          })
          .eq("id", existing.id)
          .eq("user_id", args.userId);
        if (!error) updated += 1;
        else skipped += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const result = await createGuardianEvent(supabase, input);
    if (!result.ok) {
      console.error(
        "Daily log → guardian_events create failed:",
        result.error
      );
      skipped += 1;
      continue;
    }
    created += 1;
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

export type BackfillGuardianEventsFromDailyLogsResult = {
  scanned: number;
  created: number;
  skipped: number;
  updated: number;
  errors: number;
  dailyLogsUnchanged: true;
};

/**
 * Page through daily_logs and sync events. Safe to re-run (idempotent).
 * When userId is set, only that owner's logs are processed.
 */
export async function backfillGuardianEventsFromDailyLogs(
  supabase: SupabaseClient,
  args: {
    userId?: string;
    spaceId?: string;
    limit?: number;
    offset?: number;
    createdBy?: "backfill" | "system";
  } = {}
): Promise<BackfillGuardianEventsFromDailyLogsResult> {
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
  const offset = Math.max(args.offset ?? 0, 0);

  let query = supabase
    .from("daily_logs")
    .select(LOG_SELECT)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (args.userId) {
    query = query.eq("owner_user_id", args.userId);
  }
  if (args.spaceId) {
    query = query.eq("profile_id", args.spaceId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Daily log events backfill query failed:", error.message);
    return {
      scanned: 0,
      created: 0,
      skipped: 0,
      updated: 0,
      errors: 1,
      dailyLogsUnchanged: true,
    };
  }

  const logs = (data ?? []) as DailyLogForEvents[];
  let created = 0;
  let skipped = 0;
  let updated = 0;
  let errors = 0;

  for (const log of logs) {
    const userId = args.userId ?? log.owner_user_id;
    if (!userId) {
      errors += 1;
      continue;
    }
    try {
      const result = await syncGuardianEventsFromDailyLog(supabase, {
        userId,
        log,
        createdBy: args.createdBy ?? "backfill",
      });
      created += result.created;
      skipped += result.skipped;
      updated += result.updated;
    } catch (err) {
      errors += 1;
      console.error(
        "Daily log events backfill row failed:",
        log.id,
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    scanned: logs.length,
    created,
    skipped,
    updated,
    errors,
    dailyLogsUnchanged: true,
  };
}

/** Best-effort fire-and-forget sync used from Daily Log API routes. */
export async function syncGuardianEventsFromDailyLogBestEffort(
  supabase: SupabaseClient,
  args: { userId: string; log: DailyLogForEvents }
): Promise<void> {
  try {
    await syncGuardianEventsFromDailyLog(supabase, {
      userId: args.userId,
      log: args.log,
      createdBy: "system",
    });
  } catch (err) {
    console.error(
      "Daily log → guardian_events sync failed:",
      err instanceof Error ? err.message : err
    );
  }
}
