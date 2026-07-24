import { NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/admin";
import { runProductEmailCampaign } from "@/lib/retention/run";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * One-time product email: Gideon chat attachments.
 * POST with optional JSON body: { "dryRun": true, "limit": 5 }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }
  if (!isPlatformAdmin(user.email)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let dryRun = false;
  let limit: number | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      dryRun?: boolean;
      limit?: number;
    };
    dryRun = Boolean(body.dryRun);
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.min(body.limit, 500);
    }
  } catch {
    /* empty body is fine */
  }

  const result = await runProductEmailCampaign("product_gideon_attachments", {
    dryRun,
    limit,
  });

  return NextResponse.json(result);
}
