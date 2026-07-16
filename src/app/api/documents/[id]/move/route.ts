import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedGuardianProfile } from "@/lib/profiles/server";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

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

type Ctx = { params: Promise<{ id: string }> };

function safeFileName(name: string) {
  return name.replace(/[^\w.\- ]/g, "_");
}

/**
 * Move a document to another vault (guardian profile) you own.
 * Body: { targetProfileId: string }
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: documentId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const targetProfileId =
    typeof body.targetProfileId === "string" ? body.targetProfileId.trim() : "";
  if (!targetProfileId) {
    return NextResponse.json(
      { error: "Choose which vault to move this into." },
      { status: 400 }
    );
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, user_id, profile_id, file_path, file_name")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  if (doc.profile_id === targetProfileId) {
    return NextResponse.json(
      { error: "That document is already in this vault." },
      { status: 400 }
    );
  }

  const source = await requireOwnedGuardianProfile(
    supabase,
    user.id,
    doc.profile_id
  );
  const target = await requireOwnedGuardianProfile(
    supabase,
    user.id,
    targetProfileId
  );
  if (!source || !target) {
    return NextResponse.json(
      { error: "Vault not found." },
      { status: 404 }
    );
  }

  const newPath = `${user.id}/${targetProfileId}/${crypto.randomUUID()}-${safeFileName(doc.file_name)}`;
  const oldPath = doc.file_path;

  const { error: moveError } = await supabase.storage
    .from("documents")
    .move(oldPath, newPath);

  if (moveError) {
    console.error("Document storage move failed:", moveError.message);
    return NextResponse.json(
      {
        error:
          "Couldn't move the file in storage. Check your connection and try again.",
      },
      { status: 502 }
    );
  }

  const { error: docError } = await supabase
    .from("documents")
    .update({ profile_id: targetProfileId, file_path: newPath })
    .eq("id", documentId)
    .eq("user_id", user.id);

  if (docError) {
    console.error("Document profile update failed:", docError.message);
    // Best-effort rollback of storage move
    await supabase.storage.from("documents").move(newPath, oldPath);
    return NextResponse.json(
      { error: "Couldn't update the document record. Please try again." },
      { status: 502 }
    );
  }

  const childUpdates = await Promise.all([
    supabase
      .from("extracted_data")
      .update({ profile_id: targetProfileId })
      .eq("document_id", documentId)
      .eq("user_id", user.id),
    supabase
      .from("alerts")
      .update({ profile_id: targetProfileId })
      .eq("document_id", documentId)
      .eq("user_id", user.id),
    supabase
      .from("document_chunks")
      .update({ profile_id: targetProfileId })
      .eq("document_id", documentId)
      .eq("user_id", user.id),
    supabase
      .from("document_chats")
      .update({ profile_id: targetProfileId })
      .eq("document_id", documentId)
      .eq("user_id", user.id),
    supabase
      .from("document_shares")
      .update({ profile_id: targetProfileId })
      .eq("document_id", documentId)
      .eq("user_id", user.id),
  ]);

  const childFailed = childUpdates.find((r) => r.error);
  if (childFailed?.error) {
    console.error(
      "Document related profile update failed:",
      childFailed.error.message
    );
    // Document already moved; surface a soft warning rather than rolling back storage.
    return NextResponse.json(
      {
        documentId,
        profileId: targetProfileId,
        profileName: target.display_name,
        warning:
          "Document moved, but some related records may still show under the old vault. Re-analyze if Ask can't find it.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    documentId,
    profileId: targetProfileId,
    profileName: target.display_name,
  });
}
