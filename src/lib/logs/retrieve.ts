import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scoreLogRelevance,
  todayLogDate,
  type DailyLog,
} from "./types";

/**
 * Retrieve relevant Daily Logs for the active profile only.
 * Does not send the full timeline — keyword + recent-window scoring.
 */
export async function retrieveRelevantDailyLogs(
  supabase: SupabaseClient,
  args: {
    userId: string;
    profileId: string;
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

  const { data, error } = await supabase
    .from("daily_logs")
    .select(
      "id, owner_user_id, profile_id, log_date, title, content, category, tags, source_type, created_at, updated_at"
    )
    .eq("owner_user_id", args.userId)
    .eq("profile_id", args.profileId)
    .gte("log_date", windowStart)
    .order("log_date", { ascending: false })
    .limit(80);

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

  // Soft fallback: most recent few only when the question is timeline-ish
  if (/today|yesterday|recent|log|what happened|update|follow/i.test(args.question)) {
    return (data as DailyLog[]).slice(0, Math.min(3, limit));
  }
  return [];
}

export function formatDailyLogsForGideon(logs: DailyLog[]): string {
  if (logs.length === 0) return "";
  return logs
    .map((log) => {
      const tags =
        Array.isArray(log.tags) && log.tags.length
          ? ` | tags: ${log.tags.join(", ")}`
          : "";
      const title = log.title?.trim() ? ` | title: ${log.title.trim()}` : "";
      const cat = log.category ? ` | category: ${log.category}` : "";
      return `[Daily Log ${log.log_date}${title}${cat}${tags}]\n${log.content}`;
    })
    .join("\n\n---\n\n");
}
