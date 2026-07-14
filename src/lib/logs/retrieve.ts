import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scoreLogRelevance,
  todayLogDate,
  type DailyLog,
} from "./types";

/**
 * Retrieve relevant Daily Logs for one profile, or several (container rollup).
 */
export async function retrieveRelevantDailyLogs(
  supabase: SupabaseClient,
  args: {
    userId: string;
    profileId: string;
    /** When set, search these profiles instead of only profileId. */
    profileIds?: string[];
    /** Optional map of profile id → display name for attribution. */
    profileNames?: Record<string, string>;
    question: string;
    limit?: number;
  }
): Promise<DailyLog[]> {
  const limit = args.limit ?? 6;
  const today = todayLogDate();
  const windowStart = (() => {
    const d = new Date(`${today}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 90);
    return d.toISOString().slice(0, 10);
  })();

  const scopeIds =
    args.profileIds && args.profileIds.length > 0
      ? args.profileIds
      : [args.profileId];

  let query = supabase
    .from("daily_logs")
    .select(
      "id, owner_user_id, profile_id, log_date, title, content, category, tags, source_type, created_at, updated_at"
    )
    .eq("owner_user_id", args.userId)
    .gte("log_date", windowStart)
    .order("log_date", { ascending: false })
    .limit(Math.min(80 * scopeIds.length, 200));

  query =
    scopeIds.length === 1
      ? query.eq("profile_id", scopeIds[0]!)
      : query.in("profile_id", scopeIds);

  const { data, error } = await query;

  if (error || !data?.length) return [];

  const scored = (data as DailyLog[])
    .map((log) => ({
      log,
      score: scoreLogRelevance(log, args.question, today),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.log.log_date.localeCompare(a.log.log_date));

  if (scored.length > 0) {
    return scored.slice(0, limit).map((r) => r.log);
  }

  if (/today|yesterday|recent|log|what happened|update|follow|summar|remember|this week/i.test(args.question)) {
    return (data as DailyLog[]).slice(0, Math.min(5, limit));
  }
  return (data as DailyLog[]).slice(0, Math.min(3, limit));
}

export function formatDailyLogsForGideon(
  logs: DailyLog[],
  profileNames?: Record<string, string>
): string {
  if (logs.length === 0) return "";
  return logs
    .map((log) => {
      const tags =
        Array.isArray(log.tags) && log.tags.length
          ? ` | tags: ${log.tags.join(", ")}`
          : "";
      const title = log.title?.trim() ? ` | title: ${log.title.trim()}` : "";
      const cat = log.category ? ` | category: ${log.category}` : "";
      const owner =
        profileNames?.[log.profile_id]?.trim() ||
        (profileNames ? "linked vault" : "");
      const vault = owner ? ` | vault: ${owner}` : "";
      return `[Daily Log ${log.log_date}${vault}${title}${cat}${tags}]\n${log.content}`;
    })
    .join("\n\n---\n\n");
}
