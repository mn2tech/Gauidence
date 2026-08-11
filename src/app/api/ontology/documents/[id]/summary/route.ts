import { NextResponse } from "next/server";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  isOntologyAuthed,
  requireOntologySpaceAccess,
  requireOntologyUser,
} from "@/lib/ontology/auth";
import { getDocumentOntologySummary } from "@/lib/ontology/query";

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

  const { data: doc } = await supabase
    .from("documents")
    .select("profile_id")
    .eq("id", id)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const profile = await requireOntologySpaceAccess(
    supabase,
    user.id,
    doc.profile_id
  );
  if (!profile) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const summary = await getDocumentOntologySummary(supabase, id);
  return NextResponse.json(summary);
}
