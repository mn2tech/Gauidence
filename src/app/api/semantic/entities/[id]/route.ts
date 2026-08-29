import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
import { getSemanticEntityDetail } from "@/lib/semantic/query";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const detail = await getSemanticEntityDetail(supabase, user.id, id);
  if (!detail) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
