import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";
import { classifyWatchBucket, effectiveCalendarDate } from "./dates";
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
  confidence, needs_review, extraction_version, dedupe_key,
  created_at, updated_at, completed_at, dismissed_at
`;

export type GetGuardianWatchOptions = {
  spaceId?: string;
  horizonDays?: number;
  now?: Date;
};

async function loadAccessibleSpaceIds(
  supabase: SupabaseClient,
  userId: string,
  spaceId?: string
): Promise<string[]> {
  if (spaceId) {
    const { data } = await supabase
      .from("guardian_profile_members")
      .select("profile_id")
      .eq("user_id", userId)
      .eq("profile_id", spaceId)
      .maybeSingle();
    return data?.profile_id ? [data.profile_id] : [];
  }

  const { data } = await supabase
    .from("guardian_profile_members")
    .select("profile_id")
    .eq("user_id", userId);

  return [...new Set((data ?? []).map((r) => r.profile_id as string))];
}

/**
 * Cross-Space Watch: what matters across Spaces the user can access.
 * Never bypasses membership — queries only authorized space_ids.
 */
export async function getGuardianWatch(
  supabase: SupabaseClient,
  userId: string,
  options: GetGuardianWatchOptions = {}
): Promise<GuardianWatchResult> {
  const spaceIds = await loadAccessibleSpaceIds(
    supabase,
    userId,
    options.spaceId
  );

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

  const timeZone = await getUserTimeZone(supabase, userId);
  const now = options.now ?? new Date();
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

    const effectiveDate = effectiveCalendarDate({
      eventDate: row.event_date,
      dueAt: row.due_at,
      timeZone,
      calendarDateInZone: calendarDateInUserZone,
    });

    const watchItem: GuardianWatchItem = {
      ...row,
      space_name: nameMap[row.space_id] ?? null,
      child_name: row.child_id ? nameMap[row.child_id] ?? null : null,
      effective_date: effectiveDate,
    };

    const bucket = classifyWatchBucket({
      type: row.type,
      requiresAction: row.requires_action,
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
