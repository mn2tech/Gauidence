import { NextResponse } from "next/server";
import {
  assertPackInstallableProfile,
  isPackAuthed,
  requirePackSpaceAccess,
  requirePackUser,
} from "@/lib/packs/auth";
import { getInstalledPack, loadPackDefinition } from "@/lib/packs/catalog";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/packs/[slug]?profileId=&version= — full pack definition + install state. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requirePackUser();
  if (!isPackAuthed(auth)) return auth;

  const { slug } = await params;
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId")?.trim() || null;
  const version = url.searchParams.get("version")?.trim() || undefined;

  const definition = await loadPackDefinition(auth.supabase, slug, version);
  if (!definition) {
    return NextResponse.json({ error: "Pack not found." }, { status: 404 });
  }

  let installation = null;
  let installableError: string | null = null;
  if (profileId) {
    const profile = await requirePackSpaceAccess(
      auth.supabase,
      auth.user.id,
      profileId
    );
    if (!profile) {
      return NextResponse.json({ error: "Space not found." }, { status: 404 });
    }
    installableError = assertPackInstallableProfile(profile);
    const installed = await getInstalledPack(auth.supabase, profileId, slug);
    installation = installed?.installation ?? null;
  }

  return NextResponse.json({
    definition,
    installation,
    installableError,
  });
}
