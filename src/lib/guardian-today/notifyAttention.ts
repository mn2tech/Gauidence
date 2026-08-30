import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planAllowsOutboundDigests } from "@/lib/billing/notifyEntitlements";
import { sendReminderEmail, type ReminderItem } from "@/lib/email";
import { sendPushToUser } from "@/lib/push/send";
import { sendSms } from "@/lib/sms/send";
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
import {
  memberUserIdsBySpace,
  recipientsForSpaceItem,
} from "@/lib/guardian-today/spaceNotifyRecipients";

type AttentionRow = {
  id: string;
  user_id: string;
  space_id: string | null;
  title: string;
  type: string;
  priority: string;
  requires_action: boolean;
  event_date: string | null;
  due_at: string | null;
  remind_at: string | null;
  attention_notified_at: string | null;
};

function todayInZone(timeZone: string): string {
  return calendarDateInUserZone(new Date(), timeZone);
}

/**
 * Find active Guardian items that belong in Today / Needs Attention and
 * have not been notified yet. Fan out to space members; stamp after any delivery.
 */
export async function notifyGuardianAttention(
  admin: SupabaseClient
): Promise<{
  usersNotified: number;
  itemsNotified: number;
  skipped: number;
}> {
  const { data: rows, error } = await admin
    .from("guardian_items")
    .select(
      "id, user_id, space_id, title, type, priority, requires_action, event_date, due_at, remind_at, attention_notified_at"
    )
    .eq("status", "active")
    .is("attention_notified_at", null)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error || !rows?.length) {
    return { usersNotified: 0, itemsNotified: 0, skipped: 0 };
  }

  const now = new Date();
  const todayDefault = todayInZone(GUARDIAN_TIME_ZONE);
  const candidates: AttentionRow[] = [];

  for (const row of rows as AttentionRow[]) {
    // Snoozed until later — skip until remind_at passes
    if (row.remind_at) {
      const remindMs = new Date(row.remind_at).getTime();
      if (!Number.isNaN(remindMs) && remindMs > now.getTime()) continue;
    }

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
      today: todayDefault,
      horizonDays: GUARDIAN_WATCH_HORIZON_DAYS,
    });

    if (bucket === "today" || bucket === "needsAttention") {
      candidates.push(row);
    }
  }

  if (candidates.length === 0) {
    return { usersNotified: 0, itemsNotified: 0, skipped: rows.length };
  }

  const membersBySpace = await memberUserIdsBySpace(
    admin,
    candidates.map((c) => c.space_id).filter((id): id is string => Boolean(id))
  );

  const byUser = new Map<string, AttentionRow[]>();
  for (const item of candidates) {
    const recipients = recipientsForSpaceItem(
      item.space_id,
      item.user_id,
      membersBySpace
    );
    for (const userId of recipients) {
      const list = byUser.get(userId) ?? [];
      list.push(item);
      byUser.set(userId, list);
    }
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select(
      "id, email, email_reminders_enabled, sms_notifications_enabled, phone_e164, push_notifications_enabled, plan"
    )
    .in("id", [...byUser.keys()]);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p])
  );

  const base = appBaseUrl();
  const homeUrl = `${base}${SIMPLE_HOME_PATH}`;
  const nowIso = now.toISOString();
  let usersNotified = 0;
  const deliveredItemIds = new Set<string>();

  for (const [userId, items] of byUser) {
    const profile = profileById.get(userId);
    if (!profile) continue;

    // Soft gate: free users keep Today in-app; digests are Pro+.
    if (!planAllowsOutboundDigests(profile.plan)) continue;

    const emailOk =
      Boolean(profile.email) && profile.email_reminders_enabled !== false;
    const pushOk = profile.push_notifications_enabled !== false;

    if (!emailOk && !pushOk) continue;

    const reminderItems: ReminderItem[] = items.slice(0, 8).map((item) => {
      const effectiveDate = effectiveCalendarDate({
        eventDate: item.event_date,
        dueAt: item.due_at,
        timeZone: GUARDIAN_TIME_ZONE,
        calendarDateInZone: calendarDateInUserZone,
      });
      const dueDate = effectiveDate ?? todayDefault;
      const daysLeft =
        effectiveDate != null
          ? daysBetween(todayDefault, effectiveDate) ?? 0
          : 0;
      return {
        title: item.title,
        dueDate,
        daysLeft,
        url: homeUrl,
      };
    });

    let delivered = false;

    if (emailOk && profile.email) {
      const sent = await sendReminderEmail(profile.email, reminderItems);
      // Subject still says Reminder — acceptable; body lists items. Prefer stamp even if email fails after push.
      if (sent) delivered = true;
    }

    if (pushOk) {
      const title =
        items.length === 1
          ? `Needs attention: ${items[0]!.title}`
          : `${items.length} things need your attention`;
      const body =
        items.length === 1
          ? items[0]!.title
          : items
              .slice(0, 3)
              .map((i) => i.title)
              .join(" · ");
      const pushed = await sendPushToUser(userId, {
        title,
        body,
        url: SIMPLE_HOME_PATH,
      });
      if (pushed > 0) delivered = true;

      if (
        profile.sms_notifications_enabled &&
        profile.phone_e164 &&
        items.some((i) => {
          const d = effectiveCalendarDate({
            eventDate: i.event_date,
            dueAt: i.due_at,
            timeZone: GUARDIAN_TIME_ZONE,
            calendarDateInZone: calendarDateInUserZone,
          });
          if (!d) return true;
          const left = daysBetween(todayDefault, d);
          return left !== null && left <= 1;
        })
      ) {
        void sendSms(
          profile.phone_e164,
          `Guardian: ${title}. ${homeUrl}`
        );
      }
    }

    if (!delivered) continue;

    usersNotified += 1;
    for (const item of items) deliveredItemIds.add(item.id);
  }

  if (deliveredItemIds.size > 0) {
    await admin
      .from("guardian_items")
      .update({ attention_notified_at: nowIso })
      .in("id", [...deliveredItemIds]);
  }

  return {
    usersNotified,
    itemsNotified: deliveredItemIds.size,
    skipped: rows.length - candidates.length,
  };
}
