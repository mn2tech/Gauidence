import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SETUP_CORE_KEYS,
  type AwardKey,
} from "@/lib/awards/definitions";
import { hasConsecutiveLogStreak } from "@/lib/awards/streak";

export type UserAwardRow = {
  award_key: AwardKey;
  earned_at: string;
  profile_id: string | null;
};

export async function listUserAwards(userId: string): Promise<UserAwardRow[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("user_awards")
    .select("award_key, earned_at, profile_id")
    .eq("user_id", userId)
    .order("earned_at", { ascending: true });

  if (error) {
    console.error("user_awards list failed:", error.message);
    return [];
  }

  return (data ?? []) as UserAwardRow[];
}

export async function grantAward(
  userId: string,
  awardKey: AwardKey,
  profileId?: string | null
): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;

  const { error } = await admin.from("user_awards").insert({
    user_id: userId,
    award_key: awardKey,
    profile_id: profileId ?? null,
  });

  if (error) {
    if (error.code === "23505") return false;
    console.error("user_awards insert failed:", error.message);
    return false;
  }

  return true;
}

async function maybeGrant(
  userId: string,
  awardKey: AwardKey,
  condition: boolean,
  existing: Set<AwardKey>,
  profileId?: string | null
): Promise<AwardKey[]> {
  if (!condition || existing.has(awardKey)) return [];
  const granted = await grantAward(userId, awardKey, profileId);
  if (!granted) return [];
  existing.add(awardKey);
  return [awardKey];
}

/**
 * Evaluate milestone conditions and grant any newly earned awards.
 */
export async function refreshUserAwards(
  userId: string,
  supabase: SupabaseClient
): Promise<AwardKey[]> {
  const existing = new Set(
    (await listUserAwards(userId)).map((row) => row.award_key)
  );
  const newlyGranted: AwardKey[] = [];

  const push = (keys: AwardKey[]) => {
    for (const key of keys) newlyGranted.push(key);
  };

  const [
    profileCount,
    documentCount,
    photoCount,
    logCount,
    chatCount,
    researchCount,
    logDates,
  ] = await Promise.all([
    countRows(supabase, "guardian_profiles", "owner_user_id", userId),
    countRows(supabase, "documents", "user_id", userId),
    countImageDocuments(supabase, userId),
    countRows(supabase, "daily_logs", "owner_user_id", userId),
    countRows(supabase, "vault_chats", "user_id", userId),
    countResearchEvents(supabase, userId),
    listLogDates(supabase, userId),
  ]);

  push(
    await maybeGrant(
      userId,
      "first_vault",
      profileCount > 0,
      existing
    )
  );
  push(
    await maybeGrant(
      userId,
      "first_document",
      documentCount > 0,
      existing
    )
  );
  push(
    await maybeGrant(
      userId,
      "photo_capture",
      photoCount > 0,
      existing
    )
  );
  push(
    await maybeGrant(
      userId,
      "first_daily_log",
      logCount > 0,
      existing
    )
  );
  push(
    await maybeGrant(
      userId,
      "first_ask_gideon",
      chatCount > 0,
      existing
    )
  );
  push(
    await maybeGrant(
      userId,
      "first_research",
      researchCount > 0,
      existing
    )
  );
  push(
    await maybeGrant(
      userId,
      "week_of_notes",
      hasConsecutiveLogStreak(logDates, 7),
      existing
    )
  );

  const setupReady = SETUP_CORE_KEYS.every((key) => existing.has(key));
  push(
    await maybeGrant(userId, "setup_complete", setupReady, existing)
  );

  return newlyGranted;
}

async function countRows(
  supabase: SupabaseClient,
  table: "guardian_profiles" | "documents" | "daily_logs" | "vault_chats",
  column: string,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, userId);
  if (error) {
    console.error(`${table} count failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function countImageDocuments(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("mime_type", "image/%");
  if (error) {
    console.error("documents image count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

async function countResearchEvents(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("chat_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", "research");
  if (error) {
    console.error("chat_events research count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

async function listLogDates(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date")
    .eq("owner_user_id", userId)
    .order("log_date", { ascending: false })
    .limit(120);

  if (error) {
    console.error("daily_logs dates failed:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => row.log_date as string)
    .filter(Boolean);
}

/** Attach to API JSON when new awards were earned. */
export function awardsResponseFields(newlyGranted: AwardKey[]) {
  return newlyGranted.length > 0 ? { newlyGranted } : {};
}
