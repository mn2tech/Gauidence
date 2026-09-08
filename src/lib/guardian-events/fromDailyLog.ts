/**
 * Derive guardian_events payloads from a Daily Log (pure, no DB).
 * Does not mutate daily_logs. Original log remains source of truth.
 */

import {
  extractEventsFromDailyLog,
  type DailyLogIntelligenceInput,
  type ExtractedDailyLogEvent,
} from "@/lib/guardian-items/fromDailyLog";
import {
  buildGuardianEventDedupeKey,
  dailyLogEntryDedupeKey,
} from "./dedupe";
import type {
  CreateGuardianEventInput,
  GuardianEventType,
} from "./types";

export type DailyLogForEvents = DailyLogIntelligenceInput & {
  owner_user_id?: string;
  created_at?: string | null;
};

function mapItemTypeToEventType(
  item: ExtractedDailyLogEvent
): GuardianEventType {
  if (item.type === "follow_up") return "follow_up";
  if (item.type === "deadline") return "deadline";
  if (item.type === "reminder") return "reminder";
  if (item.type === "task" || item.type === "commitment") return "task_created";
  if (
    /\b(meet|meeting|call|lunch|breakfast|dinner|appointment)\b/i.test(
      item.title
    )
  ) {
    return "meeting";
  }
  return "observation";
}

function logTitle(log: DailyLogForEvents): string {
  const title = (log.title ?? "").trim();
  if (title) return title.slice(0, 300);
  const firstLine = log.content.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (firstLine) return firstLine.slice(0, 300);
  return `Daily Log — ${log.log_date}`;
}

function occurredAtFromLog(log: DailyLogForEvents): string {
  // Noon UTC on log_date avoids timezone day-shift for History grouping.
  return `${log.log_date}T12:00:00.000Z`;
}

/**
 * Build create inputs for one Daily Log:
 * 1) Always one primary daily_log_entry (full note in History)
 * 2) Zero or more extracted meeting/follow-up/deadline fragments
 *
 * space_id = log.profile_id (log already belongs to a Space).
 * Low-confidence classification is N/A here — provenance Space is known.
 */
export function deriveGuardianEventsFromDailyLog(args: {
  userId: string;
  log: DailyLogForEvents;
  createdBy?: CreateGuardianEventInput["createdBy"];
}): CreateGuardianEventInput[] {
  const { userId, log } = args;
  const createdBy = args.createdBy ?? "backfill";
  const title = logTitle(log);
  const summary = log.content.trim().slice(0, 8000) || null;
  const occurredAt = occurredAtFromLog(log);
  const baseMeta = {
    log_date: log.log_date,
    category: undefined as string | undefined,
  };

  const primary: CreateGuardianEventInput = {
    userId,
    spaceId: log.profile_id,
    eventType: "daily_log_entry",
    title,
    summary,
    occurredAt,
    sourceType: "daily_log",
    sourceId: log.id,
    dedupeKey: dailyLogEntryDedupeKey(),
    importanceScore: 0.55,
    actionRequired: false,
    status: "open",
    metadata: {
      ...baseMeta,
      source_label: undefined,
    },
    createdBy,
    confidenceScore: 1,
  };

  const extracted = extractEventsFromDailyLog(log);
  const fragments: CreateGuardianEventInput[] = extracted.map((item, index) => {
    const eventType = mapItemTypeToEventType(item);
    return {
      userId,
      spaceId: log.profile_id,
      eventType,
      title: item.title.slice(0, 300),
      summary: item.excerpt.slice(0, 8000),
      occurredAt: `${item.eventDate}T12:00:00.000Z`,
      sourceType: "daily_log",
      sourceId: log.id,
      dedupeKey: buildGuardianEventDedupeKey({
        eventType,
        title: item.title,
        fragment: `${index}:${item.eventDate}`,
      }),
      importanceScore: item.requiresAction ? 0.75 : 0.6,
      actionRequired: item.requiresAction,
      status: "open",
      metadata: {
        log_date: log.log_date,
        related_entities: [],
        extracted_from_daily_log: true,
        guardian_item_type: item.type,
      },
      createdBy,
      confidenceScore: 0.9,
    };
  });

  return [primary, ...fragments];
}

/** True when an event row is the primary History entry for a Daily Log. */
export function isPrimaryDailyLogEvent(dedupeKey: string | null): boolean {
  return dedupeKey === dailyLogEntryDedupeKey();
}
