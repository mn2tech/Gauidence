import { NextResponse } from "next/server";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  isOntologyAuthed,
  requireOntologySpaceAccess,
  requireOntologyUser,
} from "@/lib/ontology/auth";
import { getEntityGraph } from "@/lib/ontology/query";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!isGuardianOntologyEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireOntologyUser();
  if (!isOntologyAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await context.params;
  const graph = await getEntityGraph(supabase, id);
  if (!graph) {
    return NextResponse.json({ error: "Entity not found." }, { status: 404 });
  }

  const profile = await requireOntologySpaceAccess(
    supabase,
    user.id,
    graph.entity.profile_id
  );
  if (!profile) {
    return NextResponse.json({ error: "Entity not found." }, { status: 404 });
  }

  return NextResponse.json(graph);
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!isGuardianOntologyEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireOntologyUser();
  if (!isOntologyAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await context.params;
  const { data: entity } = await supabase
    .from("ontology_entities")
    .select("profile_id")
    .eq("id", id)
    .maybeSingle();

  if (!entity) {
    return NextResponse.json({ error: "Entity not found." }, { status: 404 });
  }

  const profile = await requireOntologySpaceAccess(
    supabase,
    user.id,
    entity.profile_id
  );
  if (!profile) {
    return NextResponse.json({ error: "Entity not found." }, { status: 404 });
  }

  const { deleteOntologyEntity } = await import("@/lib/ontology/server");
  await deleteOntologyEntity(supabase, id);

  return NextResponse.json({ deleted: true });
}
