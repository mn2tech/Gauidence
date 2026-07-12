import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminderEmail, type ReminderItem } from "@/lib/email";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type AlertRow = {
  id: string;
  user_id: string;
  title: string;
  due_date: string;
  reminder_7d_sent_at: string | null;
  reminder_1d_sent_at: string | null;
};

/** Calendar "today" in Eastern Time for reminder windows. */
function todayEasternMs() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GUARDIAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return Date.UTC(y, m - 1, d);
}

function daysUntil(isoDate: string, todayMs: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - todayMs) / 86_400_000);
}

/**
 * Daily reminder job (Vercel Cron). For each non-dismissed alert due within
 * 7 days, emails the owner once when it enters the 7-day window and once more
 * the day before (or day of) the deadline. Sends are stamped per stage so a
 * rerun never emails twice.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role key isn't configured." },
      { status: 503 }
    );
  }

  const todayMs = todayEasternMs();
  const todayIso = new Date(todayMs).toISOString().slice(0, 10);
  const windowEndIso = new Date(todayMs + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data: alerts, error: alertsError } = await admin
    .from("alerts")
    .select("id, user_id, title, due_date, reminder_7d_sent_at, reminder_1d_sent_at")
    .is("dismissed_at", null)
    .gte("due_date", todayIso)
    .lte("due_date", windowEndIso)
    .order("due_date");
  if (alertsError) {
    return NextResponse.json({ error: "Failed to load alerts." }, { status: 502 });
  }

  // Keep only alerts that still owe a reminder at their current stage.
  const pending = (alerts as AlertRow[]).filter((a) => {
    const daysLeft = daysUntil(a.due_date, todayMs);
    if (daysLeft <= 1 && !a.reminder_1d_sent_at) return true;
    return !a.reminder_7d_sent_at;
  });

  if (pending.length === 0) {
    return NextResponse.json({ usersEmailed: 0, alertsIncluded: 0 });
  }

  const byUser = new Map<string, AlertRow[]>();
  for (const alert of pending) {
    const list = byUser.get(alert.user_id) ?? [];
    list.push(alert);
    byUser.set(alert.user_id, list);
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, email, email_reminders_enabled")
    .in("id", [...byUser.keys()]);
  if (profilesError) {
    return NextResponse.json({ error: "Failed to load profiles." }, { status: 502 });
  }

  const recipients = new Map(
    (profiles ?? [])
      .filter((p) => p.email && p.email_reminders_enabled !== false)
      .map((p) => [p.id as string, p.email as string])
  );

  let usersEmailed = 0;
  let alertsIncluded = 0;
  const nowIso = new Date().toISOString();
  const stamp7d: string[] = [];
  const stamp1d: string[] = [];

  for (const [userId, userAlerts] of byUser) {
    const email = recipients.get(userId);
    if (!email) continue;

    const items: ReminderItem[] = userAlerts.map((a) => ({
      title: a.title,
      dueDate: a.due_date,
      daysLeft: daysUntil(a.due_date, todayMs),
    }));

    const sent = await sendReminderEmail(email, items);
    if (!sent) continue;

    usersEmailed += 1;
    alertsIncluded += userAlerts.length;
    for (const a of userAlerts) {
      const daysLeft = daysUntil(a.due_date, todayMs);
      if (!a.reminder_7d_sent_at) stamp7d.push(a.id);
      if (daysLeft <= 1 && !a.reminder_1d_sent_at) stamp1d.push(a.id);
    }
  }

  if (stamp7d.length > 0) {
    await admin
      .from("alerts")
      .update({ reminder_7d_sent_at: nowIso })
      .in("id", stamp7d);
  }
  if (stamp1d.length > 0) {
    await admin
      .from("alerts")
      .update({ reminder_1d_sent_at: nowIso })
      .in("id", stamp1d);
  }

  return NextResponse.json({ usersEmailed, alertsIncluded });
}
