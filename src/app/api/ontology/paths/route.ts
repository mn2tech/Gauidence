import { NextResponse } from "next/server";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  isOntologyAuthed,
  requireOntologySpaceAccess,
  requireOntologyUser,
} from "@/lib/ontology/auth";
import { getEntityPaths } from "@/lib/ontology/paths";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isGuardianOntologyEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireOntologyUser();
  if (!isOntologyAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId");
  const from = searchParams.get("from");
  const to = searchParams.get("to") ?? undefined;
  const maxHopsRaw = Number(searchParams.get("maxHops") ?? "2");
  const maxHops = maxHopsRaw === 1 ? 1 : 2;
  const limit = Math.min(Number(searchParams.get("limit") ?? "12") || 12, 30);

  if (!profileId || !from) {
    return NextResponse.json(
      { error: "profileId and from are required." },
      { status: 400 }
    );
  }

  const profile = await requireOntologySpaceAccess(supabase, user.id, profileId);
  if (!profile) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const paths = await getEntityPaths(supabase, {
    spaceId: profileId,
    fromEntityId: from,
    toEntityId: to,
    maxHops,
    limit,
  });

  return NextResponse.json({ paths });
}
