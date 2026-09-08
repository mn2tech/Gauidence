/**
 * Pure helpers — score / format guardian_events for Gideon prompts.
 */

import type { GuardianEvent, GuardianEventType } from "./types";
import { formatGuardianEventSourceLabel } from "./provenance";
import { historyEventTypeLabel } from "./history";

export type GideonGuardianEvent = {
  id: string;
  space_id: string | null;
  event_type: GuardianEventType;
  title: string;
  summary: string | null;
  occurred_at: string;
  action_required: boolean;
  status: string;
  space_name: string | null;
  source_label: string;
};

const HISTORY_INTENT =
  /\b(history|what (?:did|have) i|last week|this week|last month|this month|yesterday|promises?|follow[- ]?ups?|commitments?|decisions?|meetings?|when did i|still open|remind me what|show (?:me )?(?:everything|all)|related to|in (?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i;

const OPEN_PROMISE_INTENT =
  /\b(promises?|follow[- ]?ups?|commitments?|still open|owe|need to (?:send|do|call|follow)|what should i follow)\b/i;

const TEMPORAL_INTENT =
  /\b(last week|this week|last month|this month|yesterday|today|tomorrow|in \w+ \d{4}|in (?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i;

export function wantsGuardianEventRetrieval(question: string): boolean {
  return HISTORY_INTENT.test(question.trim());
}

export function wantsOpenPromiseEvents(question: string): boolean {
  return OPEN_PROMISE_INTENT.test(question.trim());
}

export type GuardianEventTimeWindow = {
  occurredFrom: string | null;
  occurredTo: string | null;
  label: string | null;
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

/**
 * Infer a coarse occurred_at window from the question (UTC day bounds).
 * Returns null bounds when the question is not temporal.
 */
export function inferGuardianEventTimeWindow(
  question: string,
  now: Date = new Date()
): GuardianEventTimeWindow {
  const q = question.trim().toLowerCase();
  const today = startOfUtcDay(now);

  if (/\byesterday\b/.test(q)) {
    const y = addDays(today, -1);
    return {
      occurredFrom: y.toISOString(),
      occurredTo: addDays(y, 1).toISOString(),
      label: "yesterday",
    };
  }
  if (/\btoday\b/.test(q) && TEMPORAL_INTENT.test(q)) {
    return {
      occurredFrom: today.toISOString(),
      occurredTo: addDays(today, 1).toISOString(),
      label: "today",
    };
  }
  if (/\blast week\b/.test(q)) {
    const end = addDays(today, -today.getUTCDay()); // start of this week (Sun)
    const start = addDays(end, -7);
    return {
      occurredFrom: start.toISOString(),
      occurredTo: end.toISOString(),
      label: "last week",
    };
  }
  if (/\bthis week\b/.test(q)) {
    const start = addDays(today, -today.getUTCDay());
    return {
      occurredFrom: start.toISOString(),
      occurredTo: addDays(today, 1).toISOString(),
      label: "this week",
    };
  }
  if (/\blast month\b/.test(q)) {
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
    );
    const end = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
    );
    return {
      occurredFrom: start.toISOString(),
      occurredTo: end.toISOString(),
      label: "last month",
    };
  }
  if (/\bthis month\b/.test(q)) {
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
    );
    return {
      occurredFrom: start.toISOString(),
      occurredTo: addDays(today, 1).toISOString(),
      label: "this month",
    };
  }

  const monthYear = /\bin (january|february|march|april|may|june|july|august|september|october|november|december)(?: (\d{4}))?\b/.exec(
    q
  );
  if (monthYear) {
    const month = MONTHS[monthYear[1]!];
    const year = monthYear[2]
      ? Number(monthYear[2])
      : today.getUTCFullYear();
    if (month != null) {
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 1));
      return {
        occurredFrom: start.toISOString(),
        occurredTo: end.toISOString(),
        label: `${monthYear[1]} ${year}`,
      };
    }
  }

  return { occurredFrom: null, occurredTo: null, label: null };
}

export function scoreGuardianEventRelevance(
  event: GideonGuardianEvent,
  question: string
): number {
  const q = question.trim().toLowerCase();
  if (!q) return 1;
  let score = 1;
  const title = event.title.toLowerCase();
  const summary = (event.summary ?? "").toLowerCase();
  for (const token of q.split(/\W+/).filter((t) => t.length >= 3)) {
    if (title.includes(token)) score += 3;
    if (summary.includes(token)) score += 2;
    if (event.space_name?.toLowerCase().includes(token)) score += 2;
  }
  if (HISTORY_INTENT.test(q)) score += 2;
  if (wantsOpenPromiseEvents(q) && event.action_required && event.status === "open") {
    score += 5;
  }
  if (event.action_required && event.status === "open") score += 1;
  if (event.event_type === "decision" && /\bdecisions?\b/i.test(q)) score += 3;
  if (event.event_type === "meeting" && /\bmeetings?\b/i.test(q)) score += 3;
  if (event.event_type === "follow_up" && wantsOpenPromiseEvents(q)) score += 2;
  return score;
}

export function toGideonGuardianEvent(
  event: GuardianEvent,
  spaceName: string | null
): GideonGuardianEvent {
  return {
    id: event.id,
    space_id: event.space_id,
    event_type: event.event_type,
    title: event.title,
    summary: event.summary,
    occurred_at: event.occurred_at,
    action_required: event.action_required,
    status: event.status,
    space_name: spaceName,
    source_label: formatGuardianEventSourceLabel(event),
  };
}

function formatOccurredDay(iso: string): string {
  const day = iso.slice(0, 10);
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Prompt lines with mandatory Source provenance for citations. */
export function formatGuardianEventsForGideon(
  events: GideonGuardianEvent[]
): string {
  if (events.length === 0) return "(none)";
  return events
    .map((event) => {
      const when = formatOccurredDay(event.occurred_at);
      const type = historyEventTypeLabel(event.event_type);
      const space = event.space_name ? ` · ${event.space_name}` : "";
      const open =
        event.action_required && event.status === "open"
          ? " — open action"
          : "";
      const summary = event.summary?.trim()
        ? ` — ${event.summary.trim().slice(0, 160)}`
        : "";
      return `- [${when}] ${type}: ${event.title}${space}${open}${summary}\n  Source: ${event.source_label}`;
    })
    .join("\n");
}
