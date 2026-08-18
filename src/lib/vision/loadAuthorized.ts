import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isImageMimeType } from "@/lib/vault/images";
import type { GideonVisionImage } from "./types";
import { prepareImageForVision } from "./prepareImage";

/**
 * Download a private vault image for multimodal chat/analysis.
 * Space membership (allowedProfileIds) is authoritative — never use public URLs.
 */
export async function loadAuthorizedVisionImage(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    allowedProfileIds: string[];
  }
): Promise<GideonVisionImage | null> {
  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, file_path, mime_type, profile_id")
    .eq("id", args.documentId)
    .maybeSingle();

  if (!doc?.profile_id || !args.allowedProfileIds.includes(doc.profile_id)) {
    return null;
  }
  if (!isImageMimeType(doc.mime_type) || !doc.file_path) {
    return null;
  }

  const { data: file, error } = await supabase.storage
    .from("documents")
    .download(doc.file_path);
  if (error || !file) return null;

  const rawBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  let prepared;
  try {
    prepared = await prepareImageForVision({
      mimeType: doc.mime_type,
      base64: rawBase64,
      fileName: doc.file_name,
    });
  } catch {
    return null;
  }

  const extractedQuery = await supabase
    .from("extracted_data")
    .select("source_text, vision_summary, vision_transcription, summary")
    .eq("document_id", doc.id)
    .maybeSingle();
  const extracted = (
    extractedQuery.error && /vision_|schema cache/i.test(extractedQuery.error.message)
      ? (
          await supabase
            .from("extracted_data")
            .select("source_text, summary")
            .eq("document_id", doc.id)
            .maybeSingle()
        ).data
      : extractedQuery.data
  ) as {
    source_text?: string | null;
    summary?: string | null;
    vision_summary?: string | null;
    vision_transcription?: string | null;
  } | null;

  return {
    documentId: doc.id,
    fileName: doc.file_name,
    mimeType: prepared.mimeType,
    base64: prepared.base64,
    sourceText: extracted?.source_text ?? null,
    visionSummary: extracted?.vision_summary ?? extracted?.summary ?? null,
    visionTranscription: extracted?.vision_transcription ?? null,
  };
}

export async function loadAuthorizedVisionImages(
  supabase: SupabaseClient,
  args: {
    documentIds: string[];
    allowedProfileIds: string[];
    limit?: number;
  }
): Promise<GideonVisionImage[]> {
  const out: GideonVisionImage[] = [];
  const limit = args.limit ?? 3;
  for (const documentId of args.documentIds) {
    if (out.length >= limit) break;
    const image = await loadAuthorizedVisionImage(supabase, {
      documentId,
      allowedProfileIds: args.allowedProfileIds,
    });
    if (image) out.push(image);
  }
  return out;
}
