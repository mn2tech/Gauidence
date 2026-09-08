/**
 * Idempotency keys for guardian_events create/backfill.
 */

import type { GuardianEventType } from "./types";

export function normalizeEventText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTitle(title: string): string {
  return normalizeEventText(title).slice(0, 120);
}

/** Stable short hash for content-based dedupe (no crypto dependency). */
export function hashNormalizedText(text: string): string {
  const n = normalizeEventText(text);
  let h = 2166136261;
  for (let i = 0; i < n.length; i++) {
    h ^= n.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}:${n.length}`;
}

/**
 * Stable dedupe key for sourced events (e.g. daily_log backfill).
 * Combined with (user_id, source_type, source_id) in the unique index.
 */
export function buildGuardianEventDedupeKey(args: {
  eventType: GuardianEventType;
  title: string;
  /** Optional secondary discriminator (date, content hash — never a timestamp). */
  fragment?: string | number | null;
}): string {
  const titlePart = normalizeTitle(args.title) || "untitled";
  const fragment =
    args.fragment === null || args.fragment === undefined
      ? ""
      : `:${String(args.fragment)}`;
  return `${args.eventType}:${titlePart}${fragment}`;
}

/** Primary backfill key for one event per daily log row. */
export function dailyLogEntryDedupeKey(): string {
  return buildGuardianEventDedupeKey({
    eventType: "daily_log_entry",
    title: "entry",
    fragment: "primary",
  });
}

/**
 * Content-stable Tell Guardian key — same text must not create another row.
 * Uses full-body hash so title-only collisions do not collide incorrectly.
 */
export function tellGuardianDedupeKey(args: {
  eventType: GuardianEventType;
  text: string;
}): string {
  return `tell:${args.eventType}:${hashNormalizedText(args.text)}`;
}

/** Stable fragment key for extracted Daily Log events (no array index). */
export function dailyLogFragmentDedupeKey(args: {
  eventType: GuardianEventType;
  title: string;
  eventDate: string;
}): string {
  return buildGuardianEventDedupeKey({
    eventType: args.eventType,
    title: args.title,
    fragment: args.eventDate,
  });
}
