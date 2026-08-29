import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
import { getSemanticStats } from "@/lib/semantic/query";

export const runtime = "nodejs";

export async function GET() {
  if (!isGuardianSemanticLayerEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

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

  const stats = await getSemanticStats(supabase, user.id);
  return NextResponse.json(stats);
}
