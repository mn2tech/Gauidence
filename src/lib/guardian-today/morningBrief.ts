import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planAllowsOutboundDigests } from "@/lib/billing/notifyEntitlements";
import {
  sendMorningBriefEmail,
  type MorningBriefLine,
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
import {
  calendarDateInUserZone,
  GUARDIAN_TIME_ZONE,
  hourInUserZone,
  isValidIanaTimeZone,
} from "@/lib/timezone";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";

/** Local hour (0–23) when Morning Brief may send. Hourly cron hits this once/day. */
export const MORNING_BRIEF_LOCAL_HOUR = 7;

type ItemRow = {
  id: string;
  title: string;
  type: string;
  priority: string;
  requires_action: boolean;
  event_date: string | null;
  due_at: string | null;
  space_id: string;
};

export type MorningBriefPriority = {
  title: string;
  detail: string;
  spaceName: string | null;
};

export function isMorningBriefWindow(args: {
  now: Date;
  timeZone: string;
  sentOn: string | null;
}): boolean {
  const tz = isValidIanaTimeZone(args.timeZone)
    ? args.timeZone
    : GUARDIAN_TIME_ZONE;
  if (hourInUserZone(args.now, tz) !== MORNING_BRIEF_LOCAL_HOUR) {
    return false;
  }
  const today = calendarDateInUserZone(args.now, tz);
  return args.sentOn !== today;
}

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

function detailForItem(args: {
  effectiveDate: string | null;
  today: string;
}): string {
  const { effectiveDate, today } = args;
  if (effectiveDate == null) return "Needs attention";
  const days = daysBetween(today, effectiveDate);
  if (days === null) return "Needs attention";
  if (days < 0) {
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  }
  if (days === 0) return "Today";
  return `${formatShortDate(effectiveDate)} · ${days} day${days === 1 ? "" : "s"}`;
}

/** Pure: pick Today / Needs Attention lines for the morning brief. */
export function buildMorningPriorities(args: {
  items: ItemRow[];
  today: string;
  timeZone: string;
  spaceNames: Map<string, string>;
  limit?: number;
}): MorningBriefPriority[] {
  const limit = args.limit ?? 8;
  const out: MorningBriefPriority[] = [];

  for (const row of args.items) {
    if (out.length >= limit) break;
    const effectiveDate = effectiveCalendarDate({
      eventDate: row.event_date,
      dueAt: row.due_at,
      timeZone: args.timeZone,
      calendarDateInZone: calendarDateInUserZone,
    });
    const bucket = classifyWatchBucket({
      type: row.type as GuardianItemType,
      requiresAction: row.requires_action,
      priority: row.priority as GuardianItemPriority,
      effectiveDate,
      today: args.today,
      horizonDays: GUARDIAN_WATCH_HORIZON_DAYS,
    });
    if (bucket !== "today" && bucket !== "needsAttention") continue;
    out.push({
      title: row.title,
      detail: detailForItem({ effectiveDate, today: args.today }),
      spaceName: args.spaceNames.get(row.space_id) ?? null,
    });
  }

  return out;
}

/**
 * Daily Morning Brief: Gideon-framed digest of Today + Needs Attention across Spaces.
 * Hourly cron; sends once when the user's local hour hits MORNING_BRIEF_LOCAL_HOUR.
 */
export async function sendMorningBriefs(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ usersEmailed: number; skipped: number }> {
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, time_zone, morning_brief_enabled, morning_brief_sent_on, email_reminders_enabled, plan"
    )
    .eq("morning_brief_enabled", true)
    .not("email", "is", null)
    .limit(500);

  if (profilesError || !profiles?.length) {
    return { usersEmailed: 0, skipped: 0 };
  }

  const eligible = profiles.filter((p) => {
    if (!p.email) return false;
    if (!planAllowsOutboundDigests(p.plan)) return false;
    if (p.email_reminders_enabled === false) return false;
    const tz =
      typeof p.time_zone === "string" && isValidIanaTimeZone(p.time_zone)
        ? p.time_zone
        : GUARDIAN_TIME_ZONE;
    return isMorningBriefWindow({
      now,
      timeZone: tz,
      sentOn:
        typeof p.morning_brief_sent_on === "string"
          ? p.morning_brief_sent_on
          : null,
    });
  });

  if (eligible.length === 0) {
    return { usersEmailed: 0, skipped: profiles.length };
  }

  const base = appBaseUrl();
  const homeUrl = `${base}${SIMPLE_HOME_PATH}`;

  let usersEmailed = 0;
  let skipped = profiles.length - eligible.length;

  for (const profile of eligible) {
    const userId = profile.id as string;
    const tz =
      typeof profile.time_zone === "string" &&
      isValidIanaTimeZone(profile.time_zone)
        ? profile.time_zone
        : GUARDIAN_TIME_ZONE;
    const today = calendarDateInUserZone(now, tz);

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

    const { data: spaces } = await admin
      .from("guardian_profiles")
      .select("id, display_name")
      .in("id", spaceIds);
    const spaceNames = new Map<string, string>();
    for (const s of spaces ?? []) {
      if (s.id && s.display_name) {
        spaceNames.set(s.id as string, s.display_name as string);
      }
    }

    const { data: items } = await admin
      .from("guardian_items")
      .select(
        "id, title, type, priority, requires_action, event_date, due_at, space_id"
      )
      .in("space_id", spaceIds)
      .eq("status", "active")
      .order("event_date", { ascending: true, nullsFirst: false })
      .limit(80);

    const priorities = buildMorningPriorities({
      items: (items ?? []) as ItemRow[],
      today,
      timeZone: tz,
      spaceNames,
    });

    // Skip empty briefs — no noise for quiet mornings
    if (priorities.length === 0) {
      skipped += 1;
      continue;
    }

    const lines: MorningBriefLine[] = priorities.map((p) => ({
      title: p.title,
      detail: p.spaceName ? `${p.detail} · ${p.spaceName}` : p.detail,
      url: homeUrl,
    }));

    const sent = await sendMorningBriefEmail({
      to: profile.email as string,
      greetName: firstName(profile.full_name as string | null),
      priorities: lines,
      homeUrl,
      todayLabel: formatGuardianDateLabel(now, tz),
    });

    if (!sent) {
      skipped += 1;
      continue;
    }

    await admin
      .from("profiles")
      .update({ morning_brief_sent_on: today })
      .eq("id", userId);

    usersEmailed += 1;
  }

  return { usersEmailed, skipped };
}

function formatGuardianDateLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(instant);
}
