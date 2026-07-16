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
 * Relocate a storage object under a new path.
 * Prefer move(); fall back to download+upload+delete when UPDATE policy is missing.
 */
async function relocateStorageObject(
  supabase: SupabaseClient,
  oldPath: string,
  newPath: string,
  contentType: string | null
): Promise<{ error: string | null }> {
  const { error: moveError } = await supabase.storage
    .from("documents")
    .move(oldPath, newPath);

  if (!moveError) return { error: null };

  console.warn(
    "Document storage.move failed, trying copy:",
    moveError.message
  );

  const { data: blob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(oldPath);

  if (downloadError || !blob) {
    console.error(
      "Document storage download failed:",
      downloadError?.message ?? "empty"
    );
    return {
      error:
        "Couldn't read the file to move it. Check your connection and try again.",
    };
  }

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(newPath, blob, {
      contentType: contentType || undefined,
      upsert: false,
    });

  if (uploadError) {
    console.error("Document storage upload failed:", uploadError.message);
    return {
      error:
        "Couldn't copy the file into the other vault. Check your connection and try again.",
    };
  }

  const { error: removeError } = await supabase.storage
    .from("documents")
    .remove([oldPath]);

  if (removeError) {
    console.error(
      "Document storage remove-after-copy failed:",
      removeError.message
    );
    // New copy exists; leave it and surface a soft failure on old cleanup.
    // Caller still updates DB to newPath — orphan old object is better than abort mid-move.
    console.warn("Left orphan at old path after move copy:", oldPath);
  }

  return { error: null };
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
    .select("id, user_id, profile_id, file_path, file_name, mime_type")
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

  const relocated = await relocateStorageObject(
    supabase,
    oldPath,
    newPath,
    doc.mime_type
  );
  if (relocated.error) {
    return NextResponse.json({ error: relocated.error }, { status: 502 });
  }

  const { error: docError } = await supabase
    .from("documents")
    .update({ profile_id: targetProfileId, file_path: newPath })
    .eq("id", documentId)
    .eq("user_id", user.id);

  if (docError) {
    console.error("Document profile update failed:", docError.message);
    // Best-effort rollback of storage
    await relocateStorageObject(supabase, newPath, oldPath, doc.mime_type);
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
