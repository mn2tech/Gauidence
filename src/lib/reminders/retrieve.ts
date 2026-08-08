import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInUserZone } from "@/lib/timezone";
import { formatReminderWhen } from "./time";

export type GideonScheduleAlert = {
  id: string;
  profile_id: string;
  title: string;
  due_date: string;
  due_at: string | null;
  source: string | null;
  document_id: string | null;
};

const SCHEDULE_INTENT =
  /\b(schedule|calendar|remind(?:er)?s?|upcoming|attention|deadline|due|what(?:'s| is) (?:on|coming)|this week|next week|tomorrow|today)\b/i;

function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

function alertKind(alert: GideonScheduleAlert): string {
  if (alert.source === "user") return "Reminder";
  if (alert.document_id) return "Document deadline";
  return "Deadline";
}

export function scoreScheduleRelevance(
  alert: GideonScheduleAlert,
  question: string
): number {
  const q = question.trim().toLowerCase();
  if (!q) return 1;

  let score = 1;
  const title = alert.title.trim().toLowerCase();
  if (title) {
    for (const token of q.split(/\W+/).filter((t) => t.length >= 4)) {
      if (title.includes(token)) score += 3;
    }
  }
  if (SCHEDULE_INTENT.test(q)) score += 2;
  if (alert.source === "user" && /\bremind/i.test(q)) score += 2;
  if (alert.document_id && /\b(deadline|due|invoice|bill)\b/i.test(q)) {
    score += 2;
  }
  return score;
}

/** Upcoming reminders and document deadlines for Ask Gideon. */
export async function retrieveUpcomingAlertsForGideon(
  supabase: SupabaseClient,
  args: {
    profileIds: string[];
    profileNames?: Record<string, string>;
    question: string;
    timeZone: string;
    limit?: number;
    horizonDays?: number;
  }
): Promise<GideonScheduleAlert[]> {
  const limit = args.limit ?? 12;
  const horizonDays = args.horizonDays ?? 120;
  const scopeIds =
    args.profileIds.length > 0 ? [...new Set(args.profileIds)] : [];
  if (scopeIds.length === 0) return [];

  const today = calendarDateInUserZone(new Date(), args.timeZone);
  const horizonEnd = addCalendarDays(today, horizonDays);

  const { data, error } = await supabase
    .from("alerts")
    .select("id, profile_id, title, due_date, due_at, source, document_id")
    .in("profile_id", scopeIds)
    .is("dismissed_at", null)
    .gte("due_date", today)
    .lte("due_date", horizonEnd)
    .order("due_date", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(Math.min(40, limit * 4));

  if (error || !data?.length) return [];

  const alerts = data as GideonScheduleAlert[];
  const scheduleQuestion = SCHEDULE_INTENT.test(args.question);

  if (scheduleQuestion) {
    return alerts
      .map((alert) => ({
        alert,
        score: scoreScheduleRelevance(alert, args.question),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.alert.due_date.localeCompare(b.alert.due_date) ||
          (a.alert.due_at ?? "").localeCompare(b.alert.due_at ?? "")
      )
      .slice(0, limit)
      .map((row) => row.alert);
  }

  return alerts.slice(0, Math.min(6, limit));
}

export function formatAlertsForGideon(
  alerts: GideonScheduleAlert[],
  args: {
    profileNames?: Record<string, string>;
    timeZone: string;
  }
): string {
  if (alerts.length === 0) return "";

  return alerts
    .map((alert) => {
      const spaceName =
        args.profileNames?.[alert.profile_id]?.trim() ||
        (args.profileNames ? "linked space" : "");
      const spaceTag = spaceName ? ` | space: ${spaceName}` : "";
      const when = formatReminderWhen(
        alert.due_at,
        alert.due_date,
        args.timeZone
      );
      return `[${alertKind(alert)}${spaceTag} | due: ${when}]\n${alert.title.trim()}`;
    })
    .join("\n\n---\n\n");
}
