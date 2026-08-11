import { NextResponse } from "next/server";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  isOntologyAuthed,
  requireOntologySpaceAccess,
  requireOntologyUser,
} from "@/lib/ontology/auth";
import { getSpaceOntologyGraph } from "@/lib/ontology/spaceGraph";
import { ONTOLOGY_ENTITY_TYPES } from "@/lib/ontology/types";

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
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  }

  const profile = await requireOntologySpaceAccess(supabase, user.id, profileId);
  if (!profile) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const includeMentions = searchParams.get("includeMentions") === "1";
  const hideRelatedTo = searchParams.get("hideRelatedTo") === "1";
  const typesParam = searchParams.get("types");
  const entityTypes = typesParam
    ? typesParam
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) =>
          (ONTOLOGY_ENTITY_TYPES as readonly string[]).includes(t)
        )
    : undefined;

  const graph = await getSpaceOntologyGraph(supabase, {
    spaceId: profileId,
    hideDocumentMentions: !includeMentions,
    hideRelatedTo,
    entityTypes,
  });

  return NextResponse.json(graph);
}
