import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWeeklyBriefs } from "@/lib/guardian-today/weeklyBrief";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Weekly Guardian Brief (Mondays). Coming up + what changed digest.
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
    const result = await sendWeeklyBriefs(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      "Weekly brief failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Weekly brief failed." }, { status: 500 });
  }
}
