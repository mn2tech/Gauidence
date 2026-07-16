"use client";

import { createClient } from "@/lib/supabase/client";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

export const VAULT_ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

export const VAULT_MAX_SIZE_BYTES = 15 * 1024 * 1024;

export type VaultUploadResult = {
  documentId: string;
  fileName: string;
  analyzed: boolean;
  analysisError?: string;
};

/**
 * Upload a file into the active profile vault and run analysis once.
 * Used by Documents and Ask Gideon inline attach.
 */
export async function uploadAndAnalyzeToVault(args: {
  userId: string;
  profileId: string;
  file: File;
  onStatus?: (label: string) => void;
}): Promise<VaultUploadResult> {
  const supabase = createClient();
  if (!supabase) {
    throw new Error(
      "Sign-in isn't available in this browser. Refresh the page and try again."
    );
  }

  if (!VAULT_ACCEPTED_TYPES[args.file.type]) {
    throw new Error(
      "That file type isn't supported. Upload a PDF, JPG, PNG, or WebP file."
    );
  }
  if (args.file.size > VAULT_MAX_SIZE_BYTES) {
    throw new Error("That file is larger than 15 MB. Please upload a smaller file.");
  }

  args.onStatus?.("Uploading…");
  const safeName = args.file.name.replace(/[^\w.\- ]/g, "_");
  const path = `${args.userId}/${args.profileId}/${crypto.randomUUID()}-${safeName}`;

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
    throw new Error("We couldn't save the document record. Please try again.");
  }

  args.onStatus?.("Analyzing…");
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 110_000);
    let res: Response;
    try {
      res = await fetch("/api/documents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: inserted.id,
          timeZone: GUARDIAN_TIME_ZONE,
        }),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        documentId: inserted.id,
        fileName: inserted.file_name,
        analyzed: false,
        analysisError:
          body.error ??
          (res.status === 504
            ? "Analysis took too long. Try again from Documents, or upload a clearer photo."
            : "Analysis failed. You can retry from Documents."),
      };
    }

    return {
      documentId: inserted.id,
      fileName: inserted.file_name,
      analyzed: true,
    };
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "AbortError";
    return {
      documentId: inserted.id,
      fileName: inserted.file_name,
      analyzed: false,
      analysisError: timedOut
        ? "Analysis took too long. Try again from Documents, or upload a clearer photo."
        : "Analysis didn't finish. The file is in your vault — retry from Documents.",
    };
  }
}
