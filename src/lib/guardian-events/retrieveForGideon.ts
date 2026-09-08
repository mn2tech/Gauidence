/**
 * Retrieve authorized guardian_events for Ask Gideon (server).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listGuardianEvents } from "./repository";
import {
  formatGuardianEventsForGideon,
  inferGuardianEventTimeWindow,
  scoreGuardianEventRelevance,
  toGideonGuardianEvent,
  wantsOpenPromiseEvents,
  type GideonGuardianEvent,
} from "./forGideon";
import type { GuardianEventStatus } from "./types";

export {
  formatGuardianEventsForGideon,
  inferGuardianEventTimeWindow,
  scoreGuardianEventRelevance,
  wantsGuardianEventRetrieval,
  wantsOpenPromiseEvents,
} from "./forGideon";
export type { GideonGuardianEvent, GuardianEventTimeWindow } from "./forGideon";

/**
 * Load History events in authorized spaces for Gideon temporal / promise questions.
 * Always membership-scoped via listGuardianEvents.
 */
export async function retrieveGuardianEventsForGideon(
  supabase: SupabaseClient,
  args: {
    userId: string;
    spaceIds: string[];
    profileNames?: Record<string, string>;
    question: string;
    limit?: number;
    now?: Date;
    /** When true (default), include unscoped Tell Guardian notes. */
    includeUnscoped?: boolean;
  }
): Promise<GideonGuardianEvent[]> {
  const limit = args.limit ?? 16;
  const now = args.now ?? new Date();
  const scopeIds = [...new Set(args.spaceIds)].filter(Boolean);
  const includeUnscoped = args.includeUnscoped !== false;
  if (scopeIds.length === 0 && !includeUnscoped) return [];

  const window = inferGuardianEventTimeWindow(args.question, now);
  const openOnly = wantsOpenPromiseEvents(args.question);
  const statuses: GuardianEventStatus[] | undefined = openOnly
    ? ["open"]
    : undefined;

  const listed = await listGuardianEvents(supabase, {
    userId: args.userId,
    spaceIds: scopeIds.length ? scopeIds : undefined,
    includeUnscoped,
    statuses,
    actionRequired: openOnly ? true : undefined,
    occurredFrom: window.occurredFrom ?? undefined,
    occurredTo: window.occurredTo ?? undefined,
    limit: Math.max(limit * 3, 40),
  });

  if (!listed.ok) return [];

  const nameMap = args.profileNames ?? {};
  let events = listed.data.map((e) =>
    toGideonGuardianEvent(
      e,
      e.space_id ? nameMap[e.space_id] ?? null : null
    )
  );

  // If a temporal window returned nothing, fall back to recent scored events
  // so Gideon can still answer from broader History.
  if (events.length === 0 && window.occurredFrom) {
    const fallback = await listGuardianEvents(supabase, {
      userId: args.userId,
      spaceIds: scopeIds.length ? scopeIds : undefined,
      includeUnscoped,
      statuses,
      actionRequired: openOnly ? true : undefined,
      limit: Math.max(limit * 3, 40),
    });
    if (fallback.ok) {
      events = fallback.data.map((e) =>
        toGideonGuardianEvent(
          e,
          e.space_id ? nameMap[e.space_id] ?? null : null
        )
      );
    }
  }

  events.sort(
    (a, b) =>
      scoreGuardianEventRelevance(b, args.question) -
      scoreGuardianEventRelevance(a, args.question)
  );

  return events.slice(0, limit);
}
