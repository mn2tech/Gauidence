/**
 * Idempotency keys for guardian_events create/backfill.
 */

import type { GuardianEventType } from "./types";

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

/**
 * Stable dedupe key for sourced events (e.g. daily_log backfill).
 * Combined with (user_id, source_type, source_id) in the unique index.
 */
export function buildGuardianEventDedupeKey(args: {
  eventType: GuardianEventType;
  title: string;
  /** Optional secondary discriminator (e.g. extracted fragment index). */
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
