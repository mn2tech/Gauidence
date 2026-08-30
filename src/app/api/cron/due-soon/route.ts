import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDueSoon } from "@/lib/guardian-today/notifyDueSoon";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Frequent job: email/push for timed reminders and Guardian items whose
 * due_at is imminent (≈90m ahead / 2h overdue). Complements the daily
 * Needs Attention and alerts 7d/1d crons.
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

  try {
    const result = await notifyDueSoon(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      "Due-soon notify failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Due-soon notify failed." },
      { status: 500 }
    );
  }
}
