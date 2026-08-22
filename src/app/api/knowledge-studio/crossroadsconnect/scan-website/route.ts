import { NextResponse } from "next/server";
import { requireKnowledgeStudioAdmin } from "@/lib/knowledge-studio/auth";
import { scanCrossroadsWebsite } from "@/lib/knowledge-studio/website/scan";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Admin-only: scan fixed CrossRoads website URLs → draft facts/events.
 * Never auto-publishes.
 */
export async function POST() {
  const ctx = await requireKnowledgeStudioAdmin();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const result = await scanCrossroadsWebsite({
      admin: ctx.admin,
      userId: ctx.user.id,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      message:
        "Website scan complete. Review everything below before publishing.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Website scan failed.";
    console.error("Crossroads website scan failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
