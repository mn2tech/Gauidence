import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planAllowsOutboundDigests } from "@/lib/billing/notifyEntitlements";
import {
  sendWeeklyBriefEmail,
  type WeeklyBriefLine,
} from "@/lib/email";
import {
  classifyWatchBucket,
  daysBetween,
  effectiveCalendarDate,
} from "@/lib/guardian-items/dates";
import type {
  GuardianItemPriority,
  GuardianItemType,
} from "@/lib/guardian-items/types";
import { GUARDIAN_WATCH_HORIZON_DAYS } from "@/lib/guardian-items/types";
import { calendarDateInUserZone, GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";

const MIN_DAYS_BETWEEN_BRIEFS = 6;

type ItemRow = {
  id: string;
  user_id: string;
  title: string;
  type: string;
  priority: string;
  requires_action: boolean;
  event_date: string | null;
  due_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  space_id: string;
};

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function firstName(fullName: string | null | undefined): string | null {
  const t = fullName?.trim();
  if (!t) return null;
  return t.split(/\s+/)[0] ?? null;
}

/**
 * Monday Weekly Brief: coming-up + what-changed digest per user.
 */
export async function sendWeeklyBriefs(
  admin: SupabaseClient
): Promise<{ usersEmailed: number; skipped: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_DAYS_BETWEEN_BRIEFS * 86_400_000);

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, weekly_brief_enabled, weekly_brief_sent_at, email_reminders_enabled, plan"
    )
    .eq("weekly_brief_enabled", true)
    .not("email", "is", null)
    .limit(500);

  if (profilesError || !profiles?.length) {
    return { usersEmailed: 0, skipped: 0 };
  }

  const eligible = profiles.filter((p) => {
    if (!p.email) return false;
    if (!planAllowsOutboundDigests(p.plan)) return false;
    if (p.email_reminders_enabled === false) return false;
    if (p.weekly_brief_sent_at) {
      const sent = new Date(p.weekly_brief_sent_at).getTime();
      if (!Number.isNaN(sent) && sent > cutoff.getTime()) return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    return { usersEmailed: 0, skipped: profiles.length };
  }

  const today = calendarDateInUserZone(now, GUARDIAN_TIME_ZONE);
  const since = new Date(now);
  since.setDate(since.getDate() - 7);
  const base = appBaseUrl();
  const homeUrl = `${base}${SIMPLE_HOME_PATH}`;

  let usersEmailed = 0;
  let skipped = profiles.length - eligible.length;

  for (const profile of eligible) {
    const userId = profile.id as string;

    const { data: memberships } = await admin
      .from("guardian_profile_members")
      .select("profile_id")
      .eq("user_id", userId);
    const spaceIds = [
      ...new Set((memberships ?? []).map((m) => m.profile_id as string)),
    ];
    if (spaceIds.length === 0) {
      skipped += 1;
      continue;
    }

    const { data: items } = await admin
      .from("guardian_items")
      .select(
        "id, user_id, title, type, priority, requires_action, event_date, due_at, status, created_at, updated_at, space_id"
      )
      .in("space_id", spaceIds)
      .eq("status", "active")
      .order("event_date", { ascending: true, nullsFirst: false })
      .limit(80);

    const rows = (items ?? []) as ItemRow[];
    const comingUp: WeeklyBriefLine[] = [];
    let caughtCount = 0;

    for (const row of rows) {
      const effectiveDate = effectiveCalendarDate({
        eventDate: row.event_date,
        dueAt: row.due_at,
        timeZone: GUARDIAN_TIME_ZONE,
        calendarDateInZone: calendarDateInUserZone,
      });
      const bucket = classifyWatchBucket({
        type: row.type as GuardianItemType,
        requiresAction: row.requires_action,
        priority: row.priority as GuardianItemPriority,
        effectiveDate,
        today,
        horizonDays: GUARDIAN_WATCH_HORIZON_DAYS,
      });
      if (bucket === "today" || bucket === "needsAttention") {
        caughtCount += 1;
      }
      if (
        (bucket === "today" ||
          bucket === "needsAttention" ||
          bucket === "comingUp") &&
        comingUp.length < 8
      ) {
        const days =
          effectiveDate != null ? daysBetween(today, effectiveDate) : null;
        const detail =
          days === null
            ? "Needs attention"
            : days < 0
              ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
              : days === 0
                ? "Today"
                : `${formatShortDate(effectiveDate!)} · ${days} day${days === 1 ? "" : "s"}`;
        comingUp.push({
          title: row.title,
          detail,
          url: homeUrl,
        });
      }
    }

    const { data: changed } = await admin
      .from("guardian_items")
      .select("id, title, type, updated_at, created_at")
      .in("space_id", spaceIds)
      .in("status", ["active", "completed"])
      .gte("updated_at", since.toISOString())
      .order("updated_at", { ascending: false })
      .limit(6);

    const whatChanged: WeeklyBriefLine[] = (changed ?? []).map((row) => {
      const created = new Date(row.created_at).getTime();
      const updated = new Date(row.updated_at).getTime();
      const isNew = Math.abs(updated - created) < 60_000;
      return {
        title: row.title as string,
        detail: isNew ? "New this week" : "Updated this week",
        url: homeUrl,
      };
    });

    // Skip empty briefs — no noise for idle accounts
    if (comingUp.length === 0 && whatChanged.length === 0) {
      skipped += 1;
      continue;
    }

    const sent = await sendWeeklyBriefEmail({
      to: profile.email as string,
      greetName: firstName(profile.full_name as string | null),
      comingUp,
      whatChanged,
      caughtCount: Math.max(caughtCount, comingUp.length),
      homeUrl,
    });

    if (!sent) {
      skipped += 1;
      continue;
    }

    await admin
      .from("profiles")
      .update({ weekly_brief_sent_at: now.toISOString() })
      .eq("id", userId);

    usersEmailed += 1;
  }

  return { usersEmailed, skipped };
}
