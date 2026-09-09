import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNow } from "@/lib/clock";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
import { classifyWatchBucket, effectiveCalendarDate } from "./dates";
import { isCurrentlyActionable } from "./lifecycle";
import {
  applyLifecycleTransitions,
  reevaluateItemLifecycle,
  withTemporalMetadata,
} from "./lifecycle-transitions";
import { logGuardianEvent } from "./log";
import {
  GUARDIAN_WATCH_HORIZON_DAYS,
  type GuardianItemRow,
  type GuardianWatchItem,
  type GuardianWatchResult,
} from "./types";

const ITEM_SELECT = `
  id, user_id, space_id, child_id, school_context_id,
  type, title, description,
  event_date, start_at, end_at, due_at, remind_at,
  status, priority, requires_action, action_label, action_url,
  source_type, source_id, source_document_id, source_excerpt, source_page,
  confidence, needs_review, extraction_version, dedupe_key, metadata,
  created_at, updated_at, completed_at, dismissed_at
`;

export type GetGuardianWatchOptions = {
  spaceId?: string;
  spaceIds?: string[];
  horizonDays?: number;
  now?: Date;
};

async function loadAccessibleSpaceIds(
  supabase: SupabaseClient,
  userId: string,
  filter?: { spaceId?: string; spaceIds?: string[] }
): Promise<string[]> {
  const { data } = await supabase
    .from("guardian_profile_members")
    .select("profile_id")
    .eq("user_id", userId);
  const authorized = [
    ...new Set((data ?? []).map((r) => r.profile_id as string)),
  ];

  if (filter?.spaceIds?.length) {
    const allowed = new Set(authorized);
    return filter.spaceIds.filter((id) => allowed.has(id));
  }
  if (filter?.spaceId) {
    return authorized.includes(filter.spaceId) ? [filter.spaceId] : [];
  }
  return authorized;
}

/**
 * Cross-Space Watch: what matters across Spaces the user can access.
 * Never bypasses membership — queries only authorized space_ids.
 * Reevaluates temporal lifecycle on each run (deterministic, no LLM).
 */
export async function getGuardianWatch(
  supabase: SupabaseClient,
  userId: string,
  options: GetGuardianWatchOptions = {}
): Promise<GuardianWatchResult> {
  const spaceIds = await loadAccessibleSpaceIds(supabase, userId, {
    spaceId: options.spaceId,
    spaceIds: options.spaceIds,
  });

  const empty: GuardianWatchResult = {
    today: [],
    needsAttention: [],
    comingUp: [],
    later: [],
  };

  if (spaceIds.length === 0) {
    logGuardianEvent("guardian_watch_generated", {
      user_id: userId,
      today: 0,
      needs_attention: 0,
      coming_up: 0,
      later: 0,
    });
    return empty;
  }

  // Semantic + World Watch rules (additive; failures never block existing Watch)
  if (isGuardianSemanticLayerEnabled()) {
    try {
      const { evaluateSemanticWatchRules } = await import(
        "@/lib/semantic/watch-rules"
      );
      await evaluateSemanticWatchRules(supabase, userId, {
        spaceId: options.spaceId,
        now: options.now,
      });
    } catch (err) {
      console.error(
        "Semantic watch rules failed (non-blocking):",
        err instanceof Error ? err.message : err
      );
    }
    try {
      const { evaluateWorldWatchRules } = await import("@/lib/world/watch");
      await evaluateWorldWatchRules(supabase, userId, {
        spaceId: options.spaceId,
        now: options.now,
      });
    } catch (err) {
      console.error(
        "World watch rules failed (non-blocking):",
        err instanceof Error ? err.message : err
      );
    }
  }

  const timeZone = await getUserTimeZone(supabase, userId);
  const now = resolveNow(options.now);
  const today = calendarDateInUserZone(now, timeZone);
  const horizonDays = options.horizonDays ?? GUARDIAN_WATCH_HORIZON_DAYS;

  const { data, error } = await supabase
    .from("guardian_items")
    .select(ITEM_SELECT)
    .in("space_id", spaceIds)
    .eq("status", "active")
    .order("event_date", { ascending: true, nullsFirst: false })
    .limit(200);

  if (error) {
    console.error("getGuardianWatch query failed:", error.message);
    return empty;
  }

  const rows = (data ?? []) as GuardianItemRow[];

  // Temporal lifecycle reevaluation (deterministic; persists transitions)
  let lifecycleById: Map<
    string,
    ReturnType<typeof reevaluateItemLifecycle>
  > = new Map();
  try {
    lifecycleById = await applyLifecycleTransitions(supabase, userId, rows, {
      now,
      timeZone,
    });
  } catch (err) {
    console.error(
      "Lifecycle reevaluation failed (non-blocking):",
      err instanceof Error ? err.message : err
    );
    for (const row of rows) {
      lifecycleById.set(
        row.id,
        reevaluateItemLifecycle(row, { now, timeZone })
      );
    }
  }

  const nameIds = [
    ...new Set([
      ...rows.map((r) => r.space_id),
      ...rows.map((r) => r.child_id).filter((id): id is string => Boolean(id)),
    ]),
  ];

  const nameMap: Record<string, string> = {};
  if (nameIds.length > 0) {
    const { data: profiles } = await supabase
      .from("guardian_profiles")
      .select("id, display_name")
      .in("id", nameIds);
    for (const p of profiles ?? []) {
      nameMap[p.id] = p.display_name;
    }
  }

  const result: GuardianWatchResult = {
    today: [],
    needsAttention: [],
    comingUp: [],
    later: [],
  };

  const nowIso = now.toISOString();

  for (const row of rows) {
    if (row.remind_at && row.remind_at > nowIso) {
      continue;
    }

    const reeval =
      lifecycleById.get(row.id) ??
      reevaluateItemLifecycle(row, { now, timeZone });

    // Expired obsolete actions (RSVP after event, closed submit, …) stay out of Watch.
    if (!isCurrentlyActionable(reeval.temporal)) {
      continue;
    }

    const enriched = withTemporalMetadata(row, reeval);

    const effectiveDate = effectiveCalendarDate({
      eventDate: enriched.event_date,
      dueAt: enriched.due_at,
      timeZone,
      calendarDateInZone: calendarDateInUserZone,
    });

    const watchItem: GuardianWatchItem = {
      ...enriched,
      space_name: nameMap[row.space_id] ?? null,
      child_name: row.child_id ? nameMap[row.child_id] ?? null : null,
      effective_date: effectiveDate,
      temporal: reeval.temporal,
    };

    // Past completed events with follow-up: Needs Attention (not "today")
    const bucket =
      reeval.temporal.lifecycleStatus === "completed" &&
      reeval.temporal.actionability === "follow_up"
        ? "needsAttention"
        : classifyWatchBucket({
            type: row.type,
            requiresAction: watchItem.requires_action,
            priority: row.priority,
            effectiveDate,
            today,
            horizonDays,
          });

    result[bucket].push(watchItem);
  }

  const sortByDate = (a: GuardianWatchItem, b: GuardianWatchItem) => {
    const da = a.effective_date ?? "9999-99-99";
    const db = b.effective_date ?? "9999-99-99";
    if (da !== db) return da.localeCompare(db);
    return a.title.localeCompare(b.title);
  };

  result.today.sort(sortByDate);
  result.needsAttention.sort(sortByDate);
  result.comingUp.sort(sortByDate);
  result.later.sort(sortByDate);

  logGuardianEvent("guardian_watch_generated", {
    user_id: userId,
    today: result.today.length,
    needs_attention: result.needsAttention.length,
    coming_up: result.comingUp.length,
    later: result.later.length,
  });

  return result;
}
