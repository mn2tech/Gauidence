import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assignGuardianItemChild } from "@/lib/guardian-items/newsletterReview";

export const runtime = "nodejs";

export async function POST(
  request: Request,
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

  const body = (await request.json().catch(() => ({}))) as {
    childId?: string;
  };
  const childId = body.childId?.trim();
  if (!childId) {
    return NextResponse.json({ error: "childId is required." }, { status: 400 });
  }

  const result = await assignGuardianItemChild(supabase, id, childId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
