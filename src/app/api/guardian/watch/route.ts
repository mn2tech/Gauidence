import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGuardianWatch } from "@/lib/guardian-items/watch";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId")?.trim() || undefined;

  const watch = await getGuardianWatch(supabase, user.id, { spaceId });

  return NextResponse.json({
    today: watch.today,
    needsAttention: watch.needsAttention,
    comingUp: watch.comingUp,
    later: watch.later,
  });
}
