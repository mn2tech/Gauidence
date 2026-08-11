import { NextResponse } from "next/server";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  isOntologyAuthed,
  requireOntologySpaceEdit,
  requireOntologyUser,
} from "@/lib/ontology/auth";
import { createManualRelationship } from "@/lib/ontology/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isGuardianOntologyEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireOntologyUser();
  if (!isOntologyAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: {
    profileId?: string;
    sourceEntityId?: string;
    targetEntityId?: string;
    relationshipType?: string;
    properties?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { profileId, sourceEntityId, targetEntityId, relationshipType, properties } =
    body;

  if (!profileId || !sourceEntityId || !targetEntityId || !relationshipType?.trim()) {
    return NextResponse.json(
      {
        error:
          "profileId, sourceEntityId, targetEntityId, and relationshipType are required.",
      },
      { status: 400 }
    );
  }

  const profile = await requireOntologySpaceEdit(supabase, user.id, profileId);
  if (!profile) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const relationship = await createManualRelationship(supabase, {
    profileId,
    userId: user.id,
    sourceEntityId,
    targetEntityId,
    relationshipType: relationshipType.trim(),
    properties,
  });

  return NextResponse.json({ relationship });
}
