import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
import { listSemanticRelationships } from "@/lib/semantic/query";

export const runtime = "nodejs";

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  const relationships = await listSemanticRelationships(supabase, user.id, {
    type,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return NextResponse.json({ relationships });
}
