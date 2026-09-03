import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMorningBriefs } from "@/lib/guardian-today/morningBrief";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily Morning Brief. Hourly cron; sends once when the user's local hour is 7.
 * Spaces-only (Today + Needs Attention). Email inbox comes later.
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
    const result = await sendMorningBriefs(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      "Morning brief failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Morning brief failed." },
      { status: 500 }
    );
  }
}
