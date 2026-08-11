import { NextResponse } from "next/server";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  isOntologyAuthed,
  requireOntologySpaceAccess,
  requireOntologyUser,
} from "@/lib/ontology/auth";
import { getOntologySpaceStats } from "@/lib/ontology/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isGuardianOntologyEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireOntologyUser();
  if (!isOntologyAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  }

  const profile = await requireOntologySpaceAccess(supabase, user.id, profileId);
  if (!profile) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const stats = await getOntologySpaceStats(supabase, profileId);
  return NextResponse.json(stats);
}
