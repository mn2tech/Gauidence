import { NextResponse } from "next/server";
import {
  isPackAuthed,
  requirePackSpaceAccess,
  requirePackUser,
} from "@/lib/packs/auth";
import { buildPackDashboard } from "@/lib/packs/dashboard";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/packs/[slug]/dashboard?profileId= */
export async function GET(request: Request, { params }: Params) {
  const auth = await requirePackUser();
  if (!isPackAuthed(auth)) return auth;

  const { slug } = await params;
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId")?.trim() || "";
  if (!profileId) {
    return NextResponse.json(
      { error: "profileId is required." },
      { status: 400 }
    );
  }

  const profile = await requirePackSpaceAccess(
    auth.supabase,
    auth.user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const dashboard = await buildPackDashboard(auth.supabase, profileId, slug);
  if (!dashboard) {
    return NextResponse.json(
      { error: "Pack is not installed on this Space." },
      { status: 404 }
    );
  }

  return NextResponse.json({ dashboard });
}
