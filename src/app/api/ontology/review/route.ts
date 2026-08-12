import { NextResponse } from "next/server";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import {
  isOntologyAuthed,
  requireOntologySpaceAccess,
  requireOntologySpaceEdit,
  requireOntologyUser,
} from "@/lib/ontology/auth";
import { listPendingReview, setReviewStatus } from "@/lib/ontology/review";
import type { OntologyReviewStatus } from "@/lib/ontology/types";

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

  const limit = Math.min(
    Number(searchParams.get("limit") ?? "50") || 50,
    100
  );
  const items = await listPendingReview(supabase, profileId, limit);
  return NextResponse.json({ items });
}

export async function PATCH(request: Request) {
  const auth = await requireOntologyUser();
  if (!isOntologyAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: {
    profileId?: string;
    kind?: "entity" | "relationship";
    id?: string;
    status?: OntologyReviewStatus;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { profileId, kind, id, status } = body;
  if (!profileId || !kind || !id || !status) {
    return NextResponse.json(
      { error: "profileId, kind, id, and status are required." },
      { status: 400 }
    );
  }

  if (kind !== "entity" && kind !== "relationship") {
    return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  }

  if (!["pending", "confirmed", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const profile = await requireOntologySpaceEdit(supabase, user.id, profileId);
  if (!profile) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const table =
    kind === "entity" ? "ontology_entities" : "ontology_relationships";
  const { data: row } = await supabase
    .from(table)
    .select("id, profile_id")
    .eq("id", id)
    .maybeSingle();

  if (!row || row.profile_id !== profileId) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const result = await setReviewStatus(supabase, { kind, id, status });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id, kind, status });
}
