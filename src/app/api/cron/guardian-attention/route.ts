import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyGuardianAttention } from "@/lib/guardian-today/notifyAttention";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily digest: email/push for Guardian items in Today / Needs Attention
 * that have not been notified yet.
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
    const result = await notifyGuardianAttention(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      "Guardian attention notify failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Attention notify failed." },
      { status: 500 }
    );
  }
}
