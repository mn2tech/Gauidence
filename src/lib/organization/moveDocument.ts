import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuardianProfile } from "@/lib/profiles/types";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]/g, "_");
}

async function relocateStorageObject(
  supabase: SupabaseClient,
  oldPath: string,
  newPath: string,
  mimeType: string
): Promise<{ error: string | null }> {
  const { data: blob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(oldPath);
  if (downloadError || !blob) {
    return { error: "Couldn't read the stored file while moving it." };
  }

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(newPath, blob, {
      contentType: mimeType,
      upsert: false,
    });
  if (uploadError) {
    return {
      error:
        "Couldn't copy the file into the other vault. Check your connection and try again.",
    };
  }

  const { error: removeError } = await supabase.storage
    .from("documents")
    .remove([oldPath]);
  if (removeError) {
    console.warn("Left orphan at old path after move copy:", oldPath);
  }

  return { error: null };
}

export type MoveDocumentResult = {
  ok: boolean;
  error?: string;
  warning?: string;
  targetProfileId?: string;
  targetProfileName?: string;
  previousProfileId?: string;
};

/** Move a document between guardian profiles (vaults) with related record updates. */
export async function moveDocumentToProfile(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  target: GuardianProfile
): Promise<MoveDocumentResult> {
  const { data: doc } = await supabase
    .from("documents")
    .select("id, user_id, profile_id, file_path, file_name, mime_type")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!doc) {
    return { ok: false, error: "Document not found." };
  }

  if (doc.profile_id === target.id) {
    return {
      ok: true,
      targetProfileId: target.id,
      targetProfileName: target.display_name,
      previousProfileId: doc.profile_id,
    };
  }

  const newPath = `${userId}/${target.id}/${crypto.randomUUID()}-${safeFileName(doc.file_name)}`;
  const oldPath = doc.file_path;
  const previousProfileId = doc.profile_id as string;

  const relocated = await relocateStorageObject(
    supabase,
    oldPath,
    newPath,
    doc.mime_type
  );
  if (relocated.error) {
    return { ok: false, error: relocated.error };
  }

  const { error: docError } = await supabase
    .from("documents")
    .update({ profile_id: target.id, file_path: newPath })
    .eq("id", documentId)
    .eq("user_id", userId);

  if (docError) {
    await relocateStorageObject(supabase, newPath, oldPath, doc.mime_type);
    return { ok: false, error: "Couldn't update the document record. Please try again." };
  }

  const childUpdates = await Promise.all([
    supabase
      .from("extracted_data")
      .update({ profile_id: target.id })
      .eq("document_id", documentId)
      .eq("user_id", userId),
    supabase
      .from("alerts")
      .update({ profile_id: target.id })
      .eq("document_id", documentId)
      .eq("user_id", userId),
    supabase
      .from("document_chunks")
      .update({ profile_id: target.id })
      .eq("document_id", documentId)
      .eq("user_id", userId),
    supabase
      .from("document_chats")
      .update({ profile_id: target.id })
      .eq("document_id", documentId)
      .eq("user_id", userId),
    supabase
      .from("document_shares")
      .update({ profile_id: target.id })
      .eq("document_id", documentId)
      .eq("user_id", userId),
  ]);

  const childFailed = childUpdates.find((r) => r.error);
  if (childFailed?.error) {
    return {
      ok: true,
      targetProfileId: target.id,
      targetProfileName: target.display_name,
      previousProfileId,
      warning:
        "Document moved, but some related records may still show under the old vault. Re-analyze if Ask can't find it.",
    };
  }

  return {
    ok: true,
    targetProfileId: target.id,
    targetProfileName: target.display_name,
    previousProfileId,
  };
}
