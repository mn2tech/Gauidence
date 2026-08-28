import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dismissGuardianItem } from "@/lib/guardian-items/actions";
import { recordIntelligenceFeedback } from "@/lib/guardian-today/feedback";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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

  const result = await dismissGuardianItem(supabase, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  await recordIntelligenceFeedback(supabase, user.id, id, "dismissed");
  return NextResponse.json({ ok: true });
}
