/**
 * Temporal & Lifecycle Intelligence — deterministic evaluation.
 * LLMs may extract dates; this module decides past/future/status.
 */

import { resolveNow } from "@/lib/clock";
import { calendarDateInUserZone } from "@/lib/timezone";
import { daysBetween } from "./dates";
import type { GuardianItemType } from "./types";

export const TEMPORAL_ENTITY_TYPES = [
  "event",
  "deadline",
  "task",
  "meeting",
  "invoice",
  "appointment",
  "solicitation",
  "reminder",
  "document",
  "unknown",
] as const;

export type TemporalEntityType = (typeof TEMPORAL_ENTITY_TYPES)[number];

export const LIFECYCLE_STATUSES = [
  "upcoming",
  "active",
  "due_soon",
  "overdue",
  "completed",
  "expired",
  "historical",
  "unknown",
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const ACTIONABILITIES = [
  "actionable",
  "follow_up",
  "informational",
  "expired",
] as const;

export type Actionability = (typeof ACTIONABILITIES)[number];

export const ACTION_STATES = [
  "current",
  "future",
  "overdue",
  "completed",
  "expired",
] as const;

export type ActionState = (typeof ACTION_STATES)[number];

export type TemporalSourceEvidence = {
  text?: string;
  page?: number;
  sourceItemId?: string;
};

export type TemporalMetadata = {
  entityType: TemporalEntityType;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  lifecycleStatus: LifecycleStatus;
  actionability: Actionability;
  actionState?: ActionState;
  validFrom?: string;
  validUntil?: string;
  evaluatedAt: string;
  confidence: number;
  sourceEvidence?: TemporalSourceEvidence[];
  /** Kind of obsolete pre-event action when detected (rsvp, register, …). */
  obsoleteActionKind?: ObsoleteActionKind | null;
  previousLifecycleStatus?: LifecycleStatus | null;
};

export type ObsoleteActionKind =
  | "rsvp"
  | "register"
  | "attend"
  | "prepare"
  | "submit";

export type CompletionEvidence = {
  completed?: boolean;
  paid?: boolean;
  extended?: boolean;
  amended?: boolean;
  reopened?: boolean;
};

export type EvaluateLifecycleInput = {
  entityType: TemporalEntityType;
  startDate?: string | null;
  endDate?: string | null;
  dueDate?: string | null;
  now?: Date;
  /** IANA zone for calendar-day comparison; defaults to UTC calendar of `now`. */
  timeZone?: string;
  completionEvidence?: CompletionEvidence;
  /** Title/description used only to detect obsolete action kinds. */
  title?: string | null;
  description?: string | null;
  sourceExcerpt?: string | null;
  /** Existing DB status when the user marked complete. */
  itemStatus?: "active" | "completed" | "dismissed" | "expired" | "cancelled" | "superseded";
  confidence?: number;
  sourceEvidence?: TemporalSourceEvidence[];
};

export type EvaluateLifecycleResult = {
  lifecycleStatus: LifecycleStatus;
  actionability: Actionability;
  actionState: ActionState;
  validFrom?: string;
  validUntil?: string;
  evaluatedAt: string;
  confidence: number;
  obsoleteActionKind: ObsoleteActionKind | null;
  entityType: TemporalEntityType;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  sourceEvidence?: TemporalSourceEvidence[];
};

const DUE_SOON_DAYS = 7;

const OBSOLETE_PATTERNS: { kind: ObsoleteActionKind; re: RegExp }[] = [
  { kind: "rsvp", re: /\brsvp\b/i },
  { kind: "register", re: /\b(register|registration|sign[- ]?up)\b/i },
  { kind: "attend", re: /\b(attend|attendance)\b/i },
  {
    kind: "prepare",
    re: /\b(prepare|preparation|prep for)\b.{0,40}\b(event|meeting|summit)\b/i,
  },
  {
    kind: "submit",
    re: /\b(submit|submission|proposal due|rfp|solicitation)\b/i,
  },
];

export function detectObsoleteActionKind(text: string): ObsoleteActionKind | null {
  for (const { kind, re } of OBSOLETE_PATTERNS) {
    if (re.test(text)) return kind;
  }
  return null;
}

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function toCalendarDate(
  value: string | null | undefined,
  timeZone: string,
  now: Date
): string | null {
  if (!value) return null;
  if (isIsoDate(value)) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return calendarDateInUserZone(instant, timeZone);
}

function todayInZone(now: Date, timeZone: string): string {
  return calendarDateInUserZone(now, timeZone);
}

/**
 * Map guardian_items.type (+ optional text cues) to a temporal entity type.
 */
export function mapItemTypeToEntityType(
  type: GuardianItemType | string,
  textBlob?: string
): TemporalEntityType {
  const text = (textBlob ?? "").toLowerCase();
  if (
    /\b(rfp|rfq|solicitation|proposal due|bid due|tender)\b/.test(text)
  ) {
    return "solicitation";
  }
  if (/\b(invoice|amount due|payment due)\b/.test(text) || type === "payment") {
    return "invoice";
  }
  if (/\b(meeting|standup|sync|1:1|one-on-one)\b/.test(text)) {
    return "meeting";
  }

  switch (type) {
    case "event":
    case "school_closure":
    case "no_school":
    case "school_event":
    case "early_dismissal":
    case "travel":
    case "birthday":
      return "event";
    case "appointment":
      return "appointment";
    case "deadline":
    case "expiration":
    case "renewal":
    case "return_window":
    case "warranty":
    case "document_requirement":
    case "homework":
    case "test":
    case "no_homework":
      return "deadline";
    case "task":
    case "follow_up":
    case "commitment":
    case "study_reminder":
      return "task";
    case "reminder":
      return "reminder";
    case "payment":
      return "invoice";
    case "informational":
    case "spelling_list":
    case "announcement":
    case "school_contact":
      return "document";
    default:
      return "unknown";
  }
}

function buildTemporalMetadata(
  result: EvaluateLifecycleResult
): TemporalMetadata {
  return {
    entityType: result.entityType,
    ...(result.startDate ? { startDate: result.startDate } : {}),
    ...(result.endDate ? { endDate: result.endDate } : {}),
    ...(result.dueDate ? { dueDate: result.dueDate } : {}),
    lifecycleStatus: result.lifecycleStatus,
    actionability: result.actionability,
    actionState: result.actionState,
    ...(result.validFrom ? { validFrom: result.validFrom } : {}),
    ...(result.validUntil ? { validUntil: result.validUntil } : {}),
    evaluatedAt: result.evaluatedAt,
    confidence: result.confidence,
    ...(result.sourceEvidence?.length
      ? { sourceEvidence: result.sourceEvidence }
      : {}),
    obsoleteActionKind: result.obsoleteActionKind,
  };
}

/**
 * Deterministic lifecycle evaluation from dates + entity type.
 */
export function evaluateLifecycle(
  input: EvaluateLifecycleInput
): EvaluateLifecycleResult {
  const now = resolveNow(input.now);
  const timeZone = input.timeZone ?? "UTC";
  const today = todayInZone(now, timeZone);
  const evaluatedAt = now.toISOString();
  const confidence =
    typeof input.confidence === "number" &&
    input.confidence >= 0 &&
    input.confidence <= 1
      ? input.confidence
      : 0.9;

  const startDate = toCalendarDate(input.startDate, timeZone, now);
  const endDate = toCalendarDate(input.endDate, timeZone, now);
  const dueDate = toCalendarDate(input.dueDate, timeZone, now);
  const evidence = input.completionEvidence ?? {};
  const textBlob = [input.title, input.description, input.sourceExcerpt]
    .filter(Boolean)
    .join(" ");
  const obsoleteActionKind = detectObsoleteActionKind(textBlob);

  const base = {
    entityType: input.entityType,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    evaluatedAt,
    confidence,
    obsoleteActionKind,
    ...(input.sourceEvidence?.length
      ? { sourceEvidence: input.sourceEvidence }
      : {}),
  };

  if (input.itemStatus === "completed" || evidence.completed) {
    return {
      ...base,
      lifecycleStatus: "completed",
      actionability: "informational",
      actionState: "completed",
    };
  }

  if (input.itemStatus === "expired" || input.itemStatus === "cancelled") {
    return {
      ...base,
      lifecycleStatus: "expired",
      actionability: "expired",
      actionState: "expired",
    };
  }

  switch (input.entityType) {
    case "event":
    case "meeting":
    case "appointment":
      return evaluateOccurrence({
        ...base,
        today,
        startDate,
        endDate,
        dueDate,
        isMeetingLike:
          input.entityType === "meeting" || input.entityType === "appointment",
        obsoleteActionKind,
      });

    case "solicitation":
      return evaluateSolicitation({
        ...base,
        today,
        dueDate: dueDate ?? endDate ?? startDate,
        evidence,
      });

    case "invoice":
      return evaluateInvoice({
        ...base,
        today,
        dueDate: dueDate ?? endDate ?? startDate,
        evidence,
      });

    case "task":
    case "reminder":
    case "deadline":
      return evaluateTaskOrDeadline({
        ...base,
        today,
        dueDate: dueDate ?? endDate ?? startDate,
        entityType: input.entityType,
        obsoleteActionKind,
      });

    case "document":
    case "unknown":
    default: {
      const anchor = dueDate ?? endDate ?? startDate;
      if (!anchor) {
        return {
          ...base,
          lifecycleStatus: "unknown",
          actionability: "informational",
          actionState: "current",
        };
      }
      const days = daysBetween(today, anchor);
      if (days === null) {
        return {
          ...base,
          lifecycleStatus: "unknown",
          actionability: "informational",
          actionState: "current",
        };
      }
      if (days < 0) {
        return {
          ...base,
          lifecycleStatus: "historical",
          actionability: "informational",
          actionState: "expired",
          validUntil: anchor,
        };
      }
      return {
        ...base,
        lifecycleStatus: "active",
        actionability: "informational",
        actionState: "current",
      };
    }
  }
}

function evaluateOccurrence(args: {
  entityType: TemporalEntityType;
  today: string;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  isMeetingLike: boolean;
  obsoleteActionKind: ObsoleteActionKind | null;
  evaluatedAt: string;
  confidence: number;
  sourceEvidence?: TemporalSourceEvidence[];
}): EvaluateLifecycleResult {
  const eventDay = args.endDate ?? args.startDate ?? args.dueDate;
  const base = {
    entityType: args.entityType,
    ...(args.startDate ? { startDate: args.startDate } : {}),
    ...(args.endDate ? { endDate: args.endDate } : {}),
    ...(args.dueDate ? { dueDate: args.dueDate } : {}),
    evaluatedAt: args.evaluatedAt,
    confidence: args.confidence,
    obsoleteActionKind: args.obsoleteActionKind,
    ...(args.sourceEvidence?.length
      ? { sourceEvidence: args.sourceEvidence }
      : {}),
  };

  if (!eventDay) {
    return {
      ...base,
      lifecycleStatus: "unknown",
      actionability: "informational",
      actionState: "current",
    };
  }

  const days = daysBetween(args.today, eventDay);
  if (days === null) {
    return {
      ...base,
      lifecycleStatus: "unknown",
      actionability: "informational",
      actionState: "current",
    };
  }

  // Pre-event deadline (e.g. RSVP by …) separate from event day
  if (
    args.obsoleteActionKind &&
    args.dueDate &&
    args.dueDate !== eventDay
  ) {
    const dueDays = daysBetween(args.today, args.dueDate);
    if (dueDays !== null && dueDays < 0) {
      return {
        ...base,
        lifecycleStatus: "expired",
        actionability: "expired",
        actionState: "expired",
        validUntil: args.dueDate,
      };
    }
  }

  if (days > 0) {
    return {
      ...base,
      lifecycleStatus: "upcoming",
      actionability: "actionable",
      actionState: "future",
      validFrom: args.today,
      validUntil: eventDay,
    };
  }

  if (days === 0) {
    return {
      ...base,
      lifecycleStatus: "active",
      actionability: "actionable",
      actionState: "current",
      validFrom: eventDay,
      validUntil: eventDay,
    };
  }

  // Past event / meeting
  if (args.obsoleteActionKind) {
    return {
      ...base,
      lifecycleStatus: "completed",
      actionability: "expired",
      actionState: "expired",
      validUntil: eventDay,
    };
  }

  return {
    ...base,
    lifecycleStatus: "completed",
    actionability: "follow_up",
    actionState: "completed",
    validUntil: eventDay,
  };
}

function evaluateSolicitation(args: {
  entityType: TemporalEntityType;
  today: string;
  dueDate: string | null;
  evidence: CompletionEvidence;
  evaluatedAt: string;
  confidence: number;
  obsoleteActionKind: ObsoleteActionKind | null;
  sourceEvidence?: TemporalSourceEvidence[];
  startDate?: string;
  endDate?: string;
}): EvaluateLifecycleResult {
  const base = {
    entityType: args.entityType,
    ...(args.startDate ? { startDate: args.startDate } : {}),
    ...(args.endDate ? { endDate: args.endDate } : {}),
    ...(args.dueDate ? { dueDate: args.dueDate } : {}),
    evaluatedAt: args.evaluatedAt,
    confidence: args.confidence,
    obsoleteActionKind: args.obsoleteActionKind,
    ...(args.sourceEvidence?.length
      ? { sourceEvidence: args.sourceEvidence }
      : {}),
  };

  if (args.evidence.extended || args.evidence.amended || args.evidence.reopened) {
    // Treat as still open with unknown fresh deadline unless dueDate remains.
  }

  if (!args.dueDate) {
    return {
      ...base,
      lifecycleStatus: "unknown",
      actionability: "informational",
      actionState: "current",
    };
  }

  const days = daysBetween(args.today, args.dueDate);
  if (days === null) {
    return {
      ...base,
      lifecycleStatus: "unknown",
      actionability: "informational",
      actionState: "current",
    };
  }

  if (days < 0 && !args.evidence.extended && !args.evidence.reopened) {
    return {
      ...base,
      lifecycleStatus: "expired",
      actionability: "informational",
      actionState: "expired",
      validUntil: args.dueDate,
    };
  }

  if (days <= DUE_SOON_DAYS) {
    return {
      ...base,
      lifecycleStatus: "due_soon",
      actionability: "actionable",
      actionState: days < 0 ? "overdue" : "current",
      validUntil: args.dueDate,
    };
  }

  return {
    ...base,
    lifecycleStatus: "active",
    actionability: "actionable",
    actionState: "future",
    validUntil: args.dueDate,
  };
}

function evaluateInvoice(args: {
  entityType: TemporalEntityType;
  today: string;
  dueDate: string | null;
  evidence: CompletionEvidence;
  evaluatedAt: string;
  confidence: number;
  obsoleteActionKind: ObsoleteActionKind | null;
  sourceEvidence?: TemporalSourceEvidence[];
  startDate?: string;
  endDate?: string;
}): EvaluateLifecycleResult {
  const base = {
    entityType: args.entityType,
    ...(args.startDate ? { startDate: args.startDate } : {}),
    ...(args.endDate ? { endDate: args.endDate } : {}),
    ...(args.dueDate ? { dueDate: args.dueDate } : {}),
    evaluatedAt: args.evaluatedAt,
    confidence: args.confidence,
    obsoleteActionKind: args.obsoleteActionKind,
    ...(args.sourceEvidence?.length
      ? { sourceEvidence: args.sourceEvidence }
      : {}),
  };

  if (args.evidence.paid) {
    return {
      ...base,
      lifecycleStatus: "completed",
      actionability: "informational",
      actionState: "completed",
    };
  }

  if (!args.dueDate) {
    return {
      ...base,
      lifecycleStatus: "unknown",
      actionability: "actionable",
      actionState: "current",
    };
  }

  const days = daysBetween(args.today, args.dueDate);
  if (days === null) {
    return {
      ...base,
      lifecycleStatus: "unknown",
      actionability: "actionable",
      actionState: "current",
    };
  }

  if (days < 0) {
    return {
      ...base,
      lifecycleStatus: "overdue",
      actionability: "actionable",
      actionState: "overdue",
      validUntil: args.dueDate,
    };
  }

  return {
    ...base,
    lifecycleStatus: "active",
    actionability: "actionable",
    actionState: days === 0 ? "current" : "future",
    validUntil: args.dueDate,
  };
}

function evaluateTaskOrDeadline(args: {
  entityType: TemporalEntityType;
  today: string;
  dueDate: string | null;
  obsoleteActionKind: ObsoleteActionKind | null;
  evaluatedAt: string;
  confidence: number;
  sourceEvidence?: TemporalSourceEvidence[];
  startDate?: string;
  endDate?: string;
}): EvaluateLifecycleResult {
  const base = {
    entityType: args.entityType,
    ...(args.startDate ? { startDate: args.startDate } : {}),
    ...(args.endDate ? { endDate: args.endDate } : {}),
    ...(args.dueDate ? { dueDate: args.dueDate } : {}),
    evaluatedAt: args.evaluatedAt,
    confidence: args.confidence,
    obsoleteActionKind: args.obsoleteActionKind,
    ...(args.sourceEvidence?.length
      ? { sourceEvidence: args.sourceEvidence }
      : {}),
  };

  if (!args.dueDate) {
    return {
      ...base,
      lifecycleStatus: "active",
      actionability: "actionable",
      actionState: "current",
    };
  }

  const days = daysBetween(args.today, args.dueDate);
  if (days === null) {
    return {
      ...base,
      lifecycleStatus: "unknown",
      actionability: "actionable",
      actionState: "current",
    };
  }

  // RSVP / registration deadlines past due → expired (not overdue)
  if (days < 0 && args.obsoleteActionKind) {
    return {
      ...base,
      lifecycleStatus: "expired",
      actionability: "expired",
      actionState: "expired",
      validUntil: args.dueDate,
    };
  }

  if (days < 0) {
    return {
      ...base,
      lifecycleStatus: "overdue",
      actionability: "actionable",
      actionState: "overdue",
      validUntil: args.dueDate,
    };
  }

  if (days <= DUE_SOON_DAYS) {
    return {
      ...base,
      lifecycleStatus: days === 0 ? "active" : "due_soon",
      actionability: "actionable",
      actionState: "current",
      validUntil: args.dueDate,
    };
  }

  return {
    ...base,
    lifecycleStatus: "upcoming",
    actionability: "actionable",
    actionState: "future",
    validUntil: args.dueDate,
  };
}

export function toTemporalMetadata(
  result: EvaluateLifecycleResult
): TemporalMetadata {
  return buildTemporalMetadata(result);
}

/** Whether Guardian Today should surface this as a current action. */
export function isCurrentlyActionable(
  temporal: Pick<TemporalMetadata, "actionability" | "lifecycleStatus" | "actionState"> | null | undefined
): boolean {
  if (!temporal) return true;
  if (temporal.actionability === "expired") return false;
  if (temporal.actionState === "expired") return false;
  if (temporal.lifecycleStatus === "expired") return false;
  if (temporal.actionability === "informational") {
    // Completed/historical facts stay out of action lists.
    return (
      temporal.lifecycleStatus === "active" ||
      temporal.lifecycleStatus === "due_soon" ||
      temporal.lifecycleStatus === "overdue"
    );
  }
  return (
    temporal.actionability === "actionable" ||
    temporal.actionability === "follow_up"
  );
}

export type TemporalPartition =
  | "current"
  | "upcoming"
  | "overdue"
  | "completed"
  | "historical"
  | "expired";

export function partitionLifecycleStatus(
  status: LifecycleStatus
): TemporalPartition {
  switch (status) {
    case "upcoming":
      return "upcoming";
    case "overdue":
      return "overdue";
    case "completed":
      return "completed";
    case "historical":
      return "historical";
    case "expired":
      return "expired";
    case "active":
    case "due_soon":
      return "current";
    case "unknown":
    default:
      return "current";
  }
}

export function partitionTemporalItems<T extends { temporal?: TemporalMetadata | null }>(
  items: T[]
): Record<TemporalPartition, T[]> {
  const out: Record<TemporalPartition, T[]> = {
    current: [],
    upcoming: [],
    overdue: [],
    completed: [],
    historical: [],
    expired: [],
  };
  for (const item of items) {
    const status = item.temporal?.lifecycleStatus ?? "unknown";
    out[partitionLifecycleStatus(status)].push(item);
  }
  return out;
}

/** Human-readable UI label for lifecycle status. */
export function lifecycleLabel(
  status: LifecycleStatus | null | undefined,
  entityType?: TemporalEntityType | null
): string | null {
  if (!status || status === "unknown") return null;
  switch (status) {
    case "upcoming":
      return "Upcoming";
    case "active":
      return entityType === "event" || entityType === "meeting"
        ? "Today"
        : "Today";
    case "due_soon":
      return "Due soon";
    case "overdue":
      return "Overdue";
    case "completed":
      return entityType === "event" || entityType === "meeting"
        ? "Past event"
        : "Completed";
    case "expired":
      return entityType === "solicitation" ? "Closed" : "Expired";
    case "historical":
      return "Past";
    default:
      return null;
  }
}

export function formatTemporalHeader(args: {
  now: Date;
  timeZone?: string;
  lines: string[];
}): string {
  const timeZone = args.timeZone ?? "UTC";
  const dateLabel = args.now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
  const body =
    args.lines.length > 0
      ? args.lines.map((l) => `- ${l}`).join("\n")
      : "- (none)";
  return `CURRENT DATE: ${dateLabel}

TEMPORAL INTERPRETATION:
${body}`;
}

export function temporalSummaryLine(args: {
  title: string;
  temporal: TemporalMetadata;
}): string {
  const t = args.temporal;
  const date =
    t.endDate ?? t.startDate ?? t.dueDate
      ? `Event date: ${t.endDate ?? t.startDate ?? t.dueDate}`
      : null;
  const parts = [
    `${args.title}: ${t.lifecycleStatus.replace(/_/g, " ")} ${t.entityType}`,
    date,
    t.actionState ? `Action: ${t.actionState}` : null,
    t.actionability === "follow_up"
      ? "Current relevance: follow-up / historical"
      : t.actionability === "expired"
        ? "Current relevance: expired (do not recommend as action)"
        : t.actionability === "informational"
          ? "Current relevance: historical / informational"
          : null,
  ].filter(Boolean);
  return parts.join(" — ");
}

/** Suggested-question policy for temporal context. */
export function isStaleSuggestedQuestion(args: {
  question: string;
  eventLifecycle?: LifecycleStatus | null;
}): boolean {
  const q = args.question.toLowerCase();
  const past =
    args.eventLifecycle === "completed" ||
    args.eventLifecycle === "historical" ||
    args.eventLifecycle === "expired";

  if (!past) return false;

  if (
    /\b(who\s+(has\s+)?rsvp(?:ed|e?d|'d)?|would you like to rsvp|have i rsvp|rsvp'?d so far|who rsvped)\b/i.test(
      q
    )
  ) {
    return true;
  }
  if (/\b(register|sign[- ]?up)\b/i.test(q) && /\b(should|have|did|want)\b/i.test(q)) {
    return true;
  }
  if (/\bwho should i meet\b/i.test(q)) return true;
  if (/\bwhat should i prepare\b/i.test(q)) return true;
  return false;
}

export function followUpSuggestionsForCompletedEvent(
  eventName: string
): string[] {
  const short = eventName.trim() || "the event";
  return [
    `Who did I meet at ${short}?`,
    `What follow-ups came out of ${short}?`,
    `Were any opportunities identified at the event?`,
    `What commitments did I make?`,
  ];
}

export function upcomingEventSuggestions(eventName: string): string[] {
  const short = eventName.trim() || "the event";
  return [
    `Who should I meet at ${short}?`,
    `Have I RSVPed?`,
    `What should I prepare?`,
  ];
}

/**
 * Detect meaningful lifecycle transitions for Watch Engine logging/updates.
 */
export function detectLifecycleTransition(
  previous: LifecycleStatus | null | undefined,
  next: LifecycleStatus
): string | null {
  if (!previous || previous === next) return null;
  return `${previous} → ${next}`;
}

export function readTemporalFromMetadata(
  metadata: { temporal?: unknown; [key: string]: unknown } | null | undefined
): TemporalMetadata | null {
  const raw = metadata?.temporal;
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<TemporalMetadata>;
  if (
    typeof t.lifecycleStatus !== "string" ||
    typeof t.actionability !== "string" ||
    typeof t.entityType !== "string" ||
    typeof t.evaluatedAt !== "string"
  ) {
    return null;
  }
  return t as TemporalMetadata;
}
