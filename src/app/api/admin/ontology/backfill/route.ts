import { NextResponse } from "next/server";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  isOntologyAuthed,
  requireOntologyAdmin,
  requireOntologySpaceAccess,
} from "@/lib/ontology/auth";
import { backfillOntologyForDocuments } from "@/lib/ontology/backfill";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isGuardianOntologyEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireOntologyAdmin();
  if (!isOntologyAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: {
    spaceId?: string;
    profileId?: string;
    limit?: number;
    documentIds?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const profileId = body.spaceId ?? body.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "spaceId is required." }, { status: 400 });
  }

  const profile = await requireOntologySpaceAccess(supabase, user.id, profileId);
  if (!profile) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const result = await backfillOntologyForDocuments(supabase, {
    userId: user.id,
    spaceId: profileId,
    limit: body.limit,
    documentIds: body.documentIds,
  });

  return NextResponse.json(result);
}
