import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedGuardianProfile } from "@/lib/profiles/server";
import { canShareGuardianProfile } from "@/lib/profiles/types";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };
type Ctx = { params: Promise<{ id: string }> };

async function requireUser(): Promise<Authed | NextResponse> {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to be signed in." },
      { status: 401 }
    );
  }
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

/** List documents and client-sharing stats for a vault (owner only). */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: profileId } = await ctx.params;

  const owned = await requireOwnedGuardianProfile(supabase, user.id, profileId);
  if (!owned) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }
  if (!canShareGuardianProfile(owned)) {
    return NextResponse.json(
      { error: "This vault does not support client sharing controls." },
      { status: 400 }
    );
  }

  const [{ data: documents, error: docsError }, { count: viewerCount }] =
    await Promise.all([
      supabase
        .from("documents")
        .select(
          "id, file_name, category, client_visible, created_at, analysis_status"
        )
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false }),
      supabase
        .from("guardian_profile_members")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("role", "viewer"),
    ]);

  if (docsError) {
    return NextResponse.json(
      { error: "Couldn't load documents for this vault." },
      { status: 502 }
    );
  }

  const rows = documents ?? [];
  const sharedCount = rows.filter((d) => d.client_visible).length;

  return NextResponse.json({
    profile: owned,
    documents: rows.map((d) => ({
      id: d.id,
      fileName: d.file_name,
      category: d.category,
      clientVisible: Boolean(d.client_visible),
      createdAt: d.created_at,
      analysisStatus: d.analysis_status,
    })),
    sharedCount,
    hiddenCount: rows.length - sharedCount,
    totalCount: rows.length,
    viewerCount: viewerCount ?? 0,
  });
}

/** Toggle which documents viewer-role collaborators can access. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: profileId } = await ctx.params;

  const owned = await requireOwnedGuardianProfile(supabase, user.id, profileId);
  if (!owned) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }
  if (!canShareGuardianProfile(owned)) {
    return NextResponse.json(
      { error: "This vault does not support client sharing controls." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const clientVisible = body.clientVisible === true;
  const all = body.all === true;
  const documentId =
    typeof body.documentId === "string" ? body.documentId.trim() : "";
  const documentIds = Array.isArray(body.documentIds)
    ? body.documentIds.filter((id): id is string => typeof id === "string")
    : [];

  if (!all && !documentId && documentIds.length === 0) {
    return NextResponse.json(
      { error: "Provide documentId, documentIds, or all: true." },
      { status: 400 }
    );
  }

  let query = supabase
    .from("documents")
    .update({ client_visible: clientVisible })
    .eq("profile_id", profileId);

  if (!all) {
    const ids = documentId ? [documentId, ...documentIds] : documentIds;
    query = query.in("id", [...new Set(ids)]);
  }

  const { data, error } = await query.select("id");

  if (error) {
    return NextResponse.json(
      { error: "Couldn't update client sharing." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    updated: data?.length ?? 0,
    clientVisible,
  });
}
