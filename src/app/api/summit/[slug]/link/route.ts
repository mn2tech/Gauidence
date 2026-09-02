import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkSummitToProfile } from "@/lib/summit-space/linkProfile";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * Link a Guardian profile to a summit space (owner setup).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Guardian is not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    profileId?: string;
  };

  if (!body.profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }

  const result = await linkSummitToProfile(
    supabase,
    slug,
    body.profileId,
    user.id
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
