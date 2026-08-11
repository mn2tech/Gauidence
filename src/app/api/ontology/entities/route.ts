import { NextResponse } from "next/server";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  isOntologyAuthed,
  requireOntologySpaceEdit,
  requireOntologyUser,
} from "@/lib/ontology/auth";
import { createManualEntity } from "@/lib/ontology/server";
import { ONTOLOGY_ENTITY_TYPES } from "@/lib/ontology/types";

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
    entityType?: string;
    name?: string;
    description?: string;
    aliases?: string[];
    properties?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { profileId, entityType, name, description, aliases, properties } = body;
  if (!profileId || !entityType || !name?.trim()) {
    return NextResponse.json(
      { error: "profileId, entityType, and name are required." },
      { status: 400 }
    );
  }

  if (!ONTOLOGY_ENTITY_TYPES.includes(entityType as (typeof ONTOLOGY_ENTITY_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid entity type." }, { status: 400 });
  }

  const profile = await requireOntologySpaceEdit(supabase, user.id, profileId);
  if (!profile) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const entity = await createManualEntity(supabase, {
    profileId,
    userId: user.id,
    entityType,
    name: name.trim(),
    description,
    aliases,
    properties,
  });

  return NextResponse.json({ entity });
}
