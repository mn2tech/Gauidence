import { NextResponse } from "next/server";
import { runRetentionCampaign } from "@/lib/retention/run";

export const dynamic = "force-dynamic";

/**
 * Daily retention job (Vercel Cron). Sends welcome and re-engagement emails
 * for users who haven't finished setup (no vault, no document, no Gideon).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runRetentionCampaign();
  return NextResponse.json(result);
}
