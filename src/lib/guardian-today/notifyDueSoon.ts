import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planAllowsOutboundDigests } from "@/lib/billing/notifyEntitlements";
import { sendReminderEmail, type ReminderItem } from "@/lib/email";
import { sendPushToUser } from "@/lib/push/send";
import { dueSoonWindowIso } from "@/lib/guardian-today/dueSoon";
import { calendarDateInUserZone, GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";
import { hrefForResult } from "@/lib/search";

type AlertDueSoon = {
  id: string;
  user_id: string;
  title: string;
  due_at: string;
  due_date: string;
  document_id: string | null;
  profile_id: string | null;
};

type ItemDueSoon = {
  id: string;
  user_id: string;
  title: string;
  due_at: string;
  event_date: string | null;
  remind_at: string | null;
};

type Pending = {
  kind: "alert" | "item";
  id: string;
  userId: string;
  title: string;
  dueAt: string;
  path: string;
};

function alertPath(a: AlertDueSoon): string {
  if (a.document_id && a.profile_id) {
    return hrefForResult({
      kind: "document",
      id: a.document_id,
      profileId: a.profile_id,
    });
  }
  if (a.profile_id) {
    return hrefForResult({
      kind: "profile",
      id: a.profile_id,
      profileId: a.profile_id,
    });
  }
  return SIMPLE_HOME_PATH;
}

/**
 * Email + push for timed reminders / Guardian items whose due_at is
 * imminent (within the same window as the in-app Ask banner).
 */
export async function notifyDueSoon(admin: SupabaseClient): Promise<{
  usersNotified: number;
  alertsNotified: number;
  itemsNotified: number;
}> {
  const now = Date.now();
  const { fromIso, toIso } = dueSoonWindowIso(now);

  const [{ data: alerts }, { data: items }] = await Promise.all([
    admin
      .from("alerts")
      .select(
        "id, user_id, title, due_at, due_date, document_id, profile_id"
      )
      .is("dismissed_at", null)
      .not("due_at", "is", null)
      .is("due_soon_notified_at", null)
      .gte("due_at", fromIso)
      .lte("due_at", toIso)
      .limit(200),
    admin
      .from("guardian_items")
      .select("id, user_id, title, due_at, event_date, remind_at")
      .eq("status", "active")
      .not("due_at", "is", null)
      .is("due_soon_notified_at", null)
      .gte("due_at", fromIso)
      .lte("due_at", toIso)
      .limit(200),
  ]);

  const pending: Pending[] = [];

  for (const a of (alerts ?? []) as AlertDueSoon[]) {
    if (!a.due_at) continue;
    pending.push({
      kind: "alert",
      id: a.id,
      userId: a.user_id,
      title: a.title,
      dueAt: a.due_at,
      path: alertPath(a),
    });
  }

  for (const item of (items ?? []) as ItemDueSoon[]) {
    if (!item.due_at) continue;
    if (item.remind_at) {
      const remindMs = new Date(item.remind_at).getTime();
      if (!Number.isNaN(remindMs) && remindMs > now) continue;
    }
    pending.push({
      kind: "item",
      id: item.id,
      userId: item.user_id,
      title: item.title,
      dueAt: item.due_at,
      path: SIMPLE_HOME_PATH,
    });
  }

  if (pending.length === 0) {
    return { usersNotified: 0, alertsNotified: 0, itemsNotified: 0 };
  }

  const byUser = new Map<string, Pending[]>();
  for (const p of pending) {
    const list = byUser.get(p.userId) ?? [];
    list.push(p);
    byUser.set(p.userId, list);
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select(
      "id, email, email_reminders_enabled, push_notifications_enabled, plan"
    )
    .in("id", [...byUser.keys()]);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p])
  );

  const base = appBaseUrl();
  const nowIso = new Date(now).toISOString();
  let usersNotified = 0;
  let alertsNotified = 0;
  let itemsNotified = 0;

  for (const [userId, rows] of byUser) {
    const profile = profileById.get(userId);
    if (!profile) continue;

    if (!planAllowsOutboundDigests(profile.plan)) continue;

    const emailOk =
      Boolean(profile.email) && profile.email_reminders_enabled !== false;
    const pushOk = profile.push_notifications_enabled !== false;
    if (!emailOk && !pushOk) continue;

    const reminderItems: ReminderItem[] = rows.slice(0, 8).map((row) => {
      const dueDate = calendarDateInUserZone(
        new Date(row.dueAt),
        GUARDIAN_TIME_ZONE
      );
      return {
        title: row.title,
        dueDate,
        daysLeft: 0,
        url: `${base}${row.path}`,
      };
    });

    let delivered = false;

    if (emailOk && profile.email) {
      const sent = await sendReminderEmail(profile.email, reminderItems);
      if (sent) delivered = true;
    }

    if (pushOk) {
      const title =
        rows.length === 1
          ? `Due soon: ${rows[0]!.title}`
          : `${rows.length} reminders due soon`;
      const body =
        rows.length === 1
          ? rows[0]!.title
          : rows
              .slice(0, 3)
              .map((r) => r.title)
              .join(" · ");
      const pushed = await sendPushToUser(userId, {
        title,
        body,
        url: rows.length === 1 ? rows[0]!.path : SIMPLE_HOME_PATH,
      });
      if (pushed > 0) delivered = true;
    }

    if (!delivered) continue;

    const alertIds = rows.filter((r) => r.kind === "alert").map((r) => r.id);
    const itemIds = rows.filter((r) => r.kind === "item").map((r) => r.id);

    if (alertIds.length > 0) {
      await admin
        .from("alerts")
        .update({ due_soon_notified_at: nowIso })
        .in("id", alertIds);
      alertsNotified += alertIds.length;
    }
    if (itemIds.length > 0) {
      await admin
        .from("guardian_items")
        .update({ due_soon_notified_at: nowIso })
        .in("id", itemIds);
      itemsNotified += itemIds.length;
    }
    usersNotified += 1;
  }

  return { usersNotified, alertsNotified, itemsNotified };
}
