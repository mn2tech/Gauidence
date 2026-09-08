/**
 * Watch Engine lifecycle reevaluation — deterministic, no LLM.
 * Updates metadata.temporal and may expire obsolete actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNow } from "@/lib/clock";
import { calendarDateInUserZone } from "@/lib/timezone";
import { effectiveCalendarDate } from "./dates";
import {
  detectLifecycleTransition,
  evaluateLifecycle,
  mapItemTypeToEntityType,
  readTemporalFromMetadata,
  toTemporalMetadata,
  type TemporalMetadata,
} from "./lifecycle";
import { logGuardianEvent } from "./log";
import type { GuardianItemRow, GuardianItemStatus } from "./types";

export type LifecycleReevaluation = {
  temporal: TemporalMetadata;
  /** When true, DB status should move to expired. */
  shouldExpire: boolean;
  /** Transformed follow-up label for completed events. */
  followUpActionLabel: string | null;
  transition: string | null;
};

/**
 * Evaluate lifecycle for a guardian item row (pure; no DB writes).
 */
export function reevaluateItemLifecycle(
  row: Pick<
    GuardianItemRow,
    | "type"
    | "title"
    | "description"
    | "event_date"
    | "start_at"
    | "end_at"
    | "due_at"
    | "status"
    | "requires_action"
    | "action_label"
    | "source_excerpt"
    | "confidence"
    | "metadata"
  >,
  options: { now?: Date; timeZone?: string } = {}
): LifecycleReevaluation {
  const now = resolveNow(options.now);
  const timeZone = options.timeZone ?? "UTC";
  const textBlob = [row.title, row.description, row.source_excerpt, row.action_label]
    .filter(Boolean)
    .join(" ");

  const entityType = mapItemTypeToEntityType(row.type, textBlob);
  const eventDay = row.event_date;
  const startFromTs = row.start_at
    ? calendarDateInUserZone(new Date(row.start_at), timeZone)
    : null;
  const endFromTs = row.end_at
    ? calendarDateInUserZone(new Date(row.end_at), timeZone)
    : null;
  const dueFromTs = effectiveCalendarDate({
    eventDate: null,
    dueAt: row.due_at,
    timeZone,
    calendarDateInZone: calendarDateInUserZone,
  });

  const isOccurrence =
    entityType === "event" ||
    entityType === "meeting" ||
    entityType === "appointment";

  const startDate = isOccurrence
    ? eventDay ?? startFromTs
    : startFromTs ?? eventDay;
  const endDate = isOccurrence
    ? endFromTs ?? eventDay ?? startDate
    : endFromTs;
  // Tasks/deadlines/invoices: due_at, else event_date as due.
  // Occurrences: due_at is an optional pre-event deadline (RSVP); event day is start/end.
  const dueDate = isOccurrence
    ? dueFromTs
    : dueFromTs ?? eventDay ?? endFromTs ?? startFromTs;

  const previous = readTemporalFromMetadata(row.metadata ?? null);

  const result = evaluateLifecycle({
    entityType,
    startDate,
    endDate,
    dueDate,
    now,
    timeZone,
    title: row.title,
    description: row.description,
    sourceExcerpt: row.source_excerpt,
    itemStatus: row.status as GuardianItemStatus,
    confidence: row.confidence ?? previous?.confidence ?? 0.85,
    sourceEvidence: row.source_excerpt
      ? [{ text: row.source_excerpt }]
      : previous?.sourceEvidence,
    completionEvidence: {
      completed: row.status === "completed",
      paid:
        entityType === "invoice" &&
        (row.status === "completed" ||
          /\b(paid|payment received|settled)\b/i.test(textBlob)),
      extended: /\b(extension|extended|deadline extended)\b/i.test(textBlob),
      amended: /\b(amendment|amended)\b/i.test(textBlob),
      reopened: /\b(reopened|new round|re-?open)\b/i.test(textBlob),
    },
  });

  let temporal = toTemporalMetadata(result);

  if (previous?.lifecycleStatus) {
    temporal = {
      ...temporal,
      previousLifecycleStatus: previous.lifecycleStatus,
    };
  }

  const transition = detectLifecycleTransition(
    previous?.lifecycleStatus,
    temporal.lifecycleStatus
  );

  const shouldExpire =
    row.status === "active" &&
    (temporal.actionability === "expired" ||
      temporal.actionState === "expired") &&
    Boolean(temporal.obsoleteActionKind);

  const followUpActionLabel =
    temporal.lifecycleStatus === "completed" &&
    temporal.actionability === "follow_up" &&
    (entityType === "event" || entityType === "meeting")
      ? "Review contacts and opportunities"
      : null;

  return {
    temporal,
    shouldExpire,
    followUpActionLabel,
    transition,
  };
}

/**
 * Persist lifecycle updates for items that transitioned.
 * Cheap, deterministic — safe to call on every Watch evaluation.
 */
export async function applyLifecycleTransitions(
  supabase: SupabaseClient,
  userId: string,
  rows: GuardianItemRow[],
  options: { now?: Date; timeZone?: string } = {}
): Promise<Map<string, LifecycleReevaluation>> {
  const results = new Map<string, LifecycleReevaluation>();
  const updates: {
    id: string;
    reeval: LifecycleReevaluation;
    row: GuardianItemRow;
  }[] = [];

  for (const row of rows) {
    const reeval = reevaluateItemLifecycle(row, options);
    results.set(row.id, reeval);

    const prev = readTemporalFromMetadata(row.metadata ?? null);
    const changed =
      !prev ||
      prev.lifecycleStatus !== reeval.temporal.lifecycleStatus ||
      prev.actionability !== reeval.temporal.actionability ||
      prev.actionState !== reeval.temporal.actionState ||
      reeval.shouldExpire ||
      (reeval.followUpActionLabel &&
        row.action_label !== reeval.followUpActionLabel);

    if (changed) {
      updates.push({ id: row.id, reeval, row });
    }
  }

  for (const { id, reeval, row } of updates) {
    const metadata = {
      ...(row.metadata ?? {}),
      temporal: reeval.temporal,
    };
    const patch: Record<string, unknown> = {
      metadata,
      updated_at: resolveNow(options.now).toISOString(),
    };

    if (reeval.shouldExpire) {
      patch.status = "expired";
      patch.requires_action = false;
    } else if (reeval.followUpActionLabel) {
      patch.action_label = reeval.followUpActionLabel;
      patch.requires_action = true;
    }

    const { error } = await supabase
      .from("guardian_items")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error(
        "lifecycle transition update failed:",
        error.message,
        id
      );
      continue;
    }

    if (reeval.transition || reeval.shouldExpire) {
      logGuardianEvent("guardian_lifecycle_transition", {
        user_id: userId,
        item_id: id,
        transition: reeval.transition,
        lifecycle_status: reeval.temporal.lifecycleStatus,
        actionability: reeval.temporal.actionability,
        expired: reeval.shouldExpire,
      });
    }
  }

  return results;
}

/** Attach evaluated temporal onto an in-memory item (Watch path). */
export function withTemporalMetadata<T extends GuardianItemRow>(
  row: T,
  reeval: LifecycleReevaluation
): T & { temporal: TemporalMetadata } {
  return {
    ...row,
    metadata: {
      ...(row.metadata ?? {}),
      temporal: reeval.temporal,
    },
    temporal: reeval.temporal,
    ...(reeval.shouldExpire
      ? { status: "expired" as const, requires_action: false }
      : {}),
    ...(reeval.followUpActionLabel
      ? { action_label: reeval.followUpActionLabel, requires_action: true }
      : {}),
  };
}
