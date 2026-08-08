"use client";

import { createClient } from "@/lib/supabase/client";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import { syncDocumentAwards } from "@/lib/awards/client";

export const VAULT_ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "text/plain": "Text",
};

export const VAULT_MAX_SIZE_BYTES = 15 * 1024 * 1024;
export {
  VAULT_PASTE_MAX_CHARS,
  buildPastedTextFile,
} from "@/lib/vault/pastedText";

import type { OrganizationSuggestionPayload } from "@/lib/organization/types";
import {
  checkVaultStorageQuota,
  isStorageLimitError,
} from "@/lib/billing/storageClient";
import { notifyVaultActivityClient } from "@/lib/vault/clientNotifyActivity";
import type { Fact } from "@/lib/analysis/types";
import {
  scheduleDocumentAnalysis,
  type VaultUploadResult,
} from "@/lib/documents/clientProcessing";

export type { VaultUploadResult };

/**
 * Upload a file into the active profile vault and queue background analysis.
 */
export async function uploadAndAnalyzeToVault(args: {
  userId: string;
  profileId: string;
  ownerUserId?: string;
  file: File;
  onStatus?: (label: string) => void;
  analyze?: boolean;
}): Promise<VaultUploadResult> {
  const supabase = createClient();
  if (!supabase) {
    throw new Error(
      "Sign-in isn't available in this browser. Refresh the page and try again."
    );
  }

  if (!VAULT_ACCEPTED_TYPES[args.file.type]) {
    throw new Error(
      "That file type isn't supported. Upload a PDF, JPG, PNG, WebP, or paste text."
    );
  }
  if (args.file.size > VAULT_MAX_SIZE_BYTES) {
    throw new Error("That file is larger than 15 MB. Please upload a smaller file.");
  }

  try {
    await checkVaultStorageQuota({
      additionalBytes: args.file.size,
      storageOwnerId: args.ownerUserId,
    });
  } catch (err) {
    if (isStorageLimitError(err)) {
      throw err instanceof Error
        ? err
        : new Error("Vault storage limit reached.");
    }
    throw new Error("Couldn't verify storage space. Please try again.");
  }

  args.onStatus?.("Uploading to your space…");
  const safeName = args.file.name.replace(/[^\w.\- ]/g, "_");
  const storageOwner = args.ownerUserId || args.userId;
  const path = `${storageOwner}/${args.profileId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, args.file, { contentType: args.file.type });
  if (uploadError) {
    throw new Error(
      uploadError.message?.includes("Bucket not found")
        ? "Document storage isn't set up yet on this project — the site owner needs to run the latest database migration."
        : "The upload didn't finish. Check your connection and try again."
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: args.userId,
      profile_id: args.profileId,
      file_name: args.file.name,
      file_path: path,
      mime_type: args.file.type,
      size_bytes: args.file.size,
      analysis_status: "uploaded",
    })
    .select("id, file_name")
    .single();

  if (insertError || !inserted) {
    await supabase.storage.from("documents").remove([path]);
    const detail = insertError?.message?.trim();
    if (detail && /storage_limit_exceeded|vault storage limit/i.test(detail)) {
      throw new Error(
        "You've reached your vault storage limit. Delete files in Settings → Storage or upgrade your plan."
      );
    }
    throw new Error(
      detail
        ? `We couldn't save the document record: ${detail}`
        : "We couldn't save the document record. Please try again."
    );
  }

  void syncDocumentAwards(inserted.id);
  notifyVaultActivityClient({
    profileId: args.profileId,
    kind: "document",
    documentId: inserted.id,
  });

  if (args.analyze === false) {
    return {
      documentId: inserted.id,
      fileName: inserted.file_name,
      analyzed: false,
    };
  }

  args.onStatus?.("Upload complete — processing in the background…");
  const scheduled = await scheduleDocumentAnalysis(inserted.id);

  return {
    documentId: inserted.id,
    fileName: inserted.file_name,
    analyzed: scheduled.queued,
    queued: scheduled.queued,
    processingStage: scheduled.processingStage,
    processingLabel: scheduled.processingLabel,
    analysisError: scheduled.error,
  };
}
