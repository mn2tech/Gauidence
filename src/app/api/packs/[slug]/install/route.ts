import { NextResponse } from "next/server";
import {
  assertPackInstallableProfile,
  isPackAuthed,
  requirePackSpaceManage,
  requirePackUser,
} from "@/lib/packs/auth";
import { installPack } from "@/lib/packs/install";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** POST /api/packs/[slug]/install — idempotent pack install. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requirePackUser();
  if (!isPackAuthed(auth)) return auth;

  const { slug } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const profileId =
    typeof body.profileId === "string" ? body.profileId.trim() : "";
  if (!profileId) {
    return NextResponse.json(
      { error: "profileId is required." },
      { status: 400 }
    );
  }

  const profile = await requirePackSpaceManage(
    auth.supabase,
    auth.user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json(
      { error: "Only the Space owner can install Packs." },
      { status: 403 }
    );
  }

  const installableError = assertPackInstallableProfile(profile);
  if (installableError) {
    return NextResponse.json({ error: installableError }, { status: 400 });
  }

  const selectedSpaceKeys = Array.isArray(body.selectedSpaceKeys)
    ? body.selectedSpaceKeys.filter((k): k is string => typeof k === "string")
    : [];

  try {
    const result = await installPack(auth.supabase, {
      profileId,
      packSlug: slug,
      selectedSpaceKeys,
      installedBy: auth.user.id,
    });
    return NextResponse.json({
      ok: true,
      alreadyInstalled: result.alreadyInstalled,
      installation: result.profilePack,
      spaces: result.spaces,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Install failed." },
      { status: 500 }
    );
  }
}
