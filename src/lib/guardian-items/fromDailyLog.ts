import type { SupabaseClient } from "@supabase/supabase-js";
import { addCalendarDays } from "./dates";
import { buildDedupeKey } from "./dedupe";
import { logGuardianEvent } from "./log";
import type { GuardianItemType } from "./types";

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export type DailyLogIntelligenceInput = {
  id: string;
  profile_id: string;
  title: string | null;
  content: string;
  log_date: string;
};

export type ExtractedDailyLogEvent = {
  type: GuardianItemType;
  title: string;
  eventDate: string;
  excerpt: string;
  requiresAction: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function defaultYear(logDate: string): number {
  const y = Number(logDate.slice(0, 4));
  return Number.isFinite(y) && y >= 2000 ? y : new Date().getUTCFullYear();
}

/** Parse a calendar date from free text near an event mention. */
export function parseEventDateFromText(
  text: string,
  logDate: string
): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;

  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const long = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?,?\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i.exec(
    t
  );
  if (long) {
    const month = MONTHS[long[1]!.toLowerCase()];
    const day = Number(long[2]);
    const year = long[3] ? Number(long[3]) : defaultYear(logDate);
    if (month) return toIsoDate(year, month, day);
  }

  if (/\btomorrow\b/i.test(t)) {
    return addCalendarDays(logDate, 1);
  }
  if (/\btoday\b/i.test(t)) {
    return logDate;
  }

  return null;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^event:\s*/i, "")
    .replace(/\s+[—–-]\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday).*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function looksLikeEvent(text: string): boolean {
  return /\b(event|appointment|meeting|breakfast|lunch|dinner|ceremony|conference|hearing|game|recital|concert|wedding|interview|deadline|due|follow[- ]?up)\b/i.test(
    text
  );
}

/**
 * Derive Watch-ready events from a Daily Log without an LLM call.
 * Prefers explicit "Event:" lines and dated titles/bodies.
 */
export function extractEventsFromDailyLog(
  log: DailyLogIntelligenceInput
): ExtractedDailyLogEvent[] {
  const title = (log.title ?? "").trim();
  const content = log.content.trim();
  const combined = `${title}\n${content}`.trim();
  if (!combined) return [];

  const events: ExtractedDailyLogEvent[] = [];
  const seen = new Set<string>();

  const push = (event: ExtractedDailyLogEvent) => {
    const key = `${event.type}|${event.eventDate}|${event.title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(event);
  };

  const eventLine =
    /(?:^|\n)\s*(?:\*?\*?)?Event:\s*(.+?)(?:\n|$)/i.exec(combined);
  if (eventLine?.[1]) {
    const line = eventLine[1].trim();
    const date =
      parseEventDateFromText(line, log.log_date) ??
      parseEventDateFromText(combined, log.log_date);
    if (date) {
      push({
        type: "event",
        title: cleanTitle(line) || cleanTitle(title) || "Upcoming event",
        eventDate: date,
        excerpt: line.slice(0, 400),
        requiresAction: false,
      });
    }
  }

  // Deadlines / follow-ups mentioned in the log
  if (
    /\b(deadline|due|submit|follow[- ]?up|remind(?:er)?)\b/i.test(combined)
  ) {
    const date =
      parseEventDateFromText(combined, log.log_date) ??
      (/\btomorrow\b/i.test(combined)
        ? addCalendarDays(log.log_date, 1)
        : null);
    if (date) {
      const isFollowUp = /\bfollow[- ]?up\b/i.test(combined);
      push({
        type: isFollowUp ? "follow_up" : "deadline",
        title:
          cleanTitle(title) ||
          (isFollowUp ? "Follow-up" : "Deadline from Daily Log"),
        eventDate: date,
        excerpt: combined.slice(0, 400),
        requiresAction: true,
      });
    }
  }

  // Calendar-style events (breakfast, meeting, appointment) when no Event: line
  if (
    events.length === 0 &&
    (looksLikeEvent(combined) || Boolean(title))
  ) {
    const date =
      parseEventDateFromText(title, log.log_date) ??
      parseEventDateFromText(content, log.log_date);
    if (date) {
      push({
        type: "event",
        title:
          cleanTitle(title) ||
          cleanTitle(content.split(/\n/)[0] ?? "") ||
          "Upcoming event",
        eventDate: date,
        excerpt: combined.slice(0, 400),
        requiresAction: false,
      });
    }
  }

  return events;
}

/**
 * Create/update guardian_items for dated events found in a Daily Log.
 * Idempotent via space + dedupe_key (includes daily_log id).
 */
export async function syncGuardianItemsFromDailyLog(
  supabase: SupabaseClient,
  args: {
    userId: string;
    log: DailyLogIntelligenceInput;
  }
): Promise<{ created: number; skipped: number }> {
  const extracted = extractEventsFromDailyLog(args.log);
  if (extracted.length === 0) {
    return { created: 0, skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const event of extracted) {
    const baseKey = buildDedupeKey({
      type: event.type,
      title: event.title,
      effectiveDate: event.eventDate,
      childId: null,
      sourceDocumentId: null,
    });
    const dedupeKey = `${baseKey}|daily_log|${args.log.id}`.slice(0, 500);

    const { data: existing } = await supabase
      .from("guardian_items")
      .select("id")
      .eq("space_id", args.log.profile_id)
      .eq("dedupe_key", dedupeKey)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    const { data, error } = await supabase
      .from("guardian_items")
      .insert({
        user_id: args.userId,
        space_id: args.log.profile_id,
        child_id: null,
        school_context_id: null,
        type: event.type,
        title: event.title.slice(0, 300),
        description: event.excerpt.slice(0, 500),
        event_date: event.eventDate,
        due_at: null,
        status: "active",
        priority: event.requiresAction ? "normal" : "normal",
        requires_action: event.requiresAction,
        source_type: "daily_log",
        source_id: args.log.id,
        source_document_id: null,
        source_excerpt: event.excerpt.slice(0, 800),
        confidence: 0.95,
        needs_review: false,
        extraction_version: "daily_log_v1",
        dedupe_key: dedupeKey,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      // Unique violation = already created
      if (error?.message?.includes("duplicate") || error?.code === "23505") {
        skipped += 1;
        continue;
      }
      console.error(
        "Daily log guardian item insert failed:",
        error?.message ?? "unknown"
      );
      skipped += 1;
      continue;
    }

    created += 1;
    logGuardianEvent("guardian_item_created", {
      item_id: data.id,
      space_id: args.log.profile_id,
      type: event.type,
      source_type: "daily_log",
    });
  }

  return { created, skipped };
}
