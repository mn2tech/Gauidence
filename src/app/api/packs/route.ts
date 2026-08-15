import { NextResponse } from "next/server";
import { isPackAuthed, requirePackUser, requirePackSpaceAccess } from "@/lib/packs/auth";
import { listPacks } from "@/lib/packs/catalog";

export const runtime = "nodejs";

/** GET /api/packs?profileId= — list available + installed packs for a Space. */
export async function GET(request: Request) {
  const auth = await requirePackUser();
  if (!isPackAuthed(auth)) return auth;

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId")?.trim() || null;

  if (profileId) {
    const profile = await requirePackSpaceAccess(
      auth.supabase,
      auth.user.id,
      profileId
    );
    if (!profile) {
      return NextResponse.json({ error: "Space not found." }, { status: 404 });
    }
  }

  try {
    const packs = await listPacks(auth.supabase, profileId);
    return NextResponse.json({ packs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list packs." },
      { status: 500 }
    );
  }
}
