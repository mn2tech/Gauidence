import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { indexDocumentForVault } from "./indexDocument";
import { isImageMimeType } from "./images";
import type { RetrievedChunk } from "./retrieve";
import { prepareImageForVision } from "@/lib/vision/prepareImage";

export type AttachedVaultDocument = {
  documentId: string;
  fileName: string;
  mimeType: string;
  profileId: string;
  profileName?: string;
  isImage: boolean;
  sourceText: string | null;
  chunks: RetrievedChunk[];
  imageBase64: string | null;
  analysisStatus?: string | null;
  visionStatus?: string | null;
  visionSummary?: string | null;
};

function toPinnedChunks(
  rows: {
    id: string;
    document_id: string;
    file_name: string;
    content: string;
    chunk_index: number;
    profile_id?: string;
  }[],
  profileName?: string
): RetrievedChunk[] {
  return rows.map((row) => ({
    id: row.id,
    document_id: row.document_id,
    file_name: row.file_name,
    content: row.content,
    chunk_index: row.chunk_index,
    similarity: 1,
    profile_id: row.profile_id,
    profile_name: profileName,
  }));
}

/**
 * Load a document the user attached in Ask Gideon so it is always in context
 * (RAG alone often misses a just-uploaded photo).
 * Space membership is authoritative — do not require documents.user_id = caller.
 */
export async function loadAttachedVaultDocument(
  supabase: SupabaseClient,
  args: {
    userId: string;
    documentId: string;
    allowedProfileIds: string[];
    profileNames: Record<string, string>;
  }
): Promise<AttachedVaultDocument | null> {
  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, file_path, mime_type, profile_id, analysis_status")
    .eq("id", args.documentId)
    .maybeSingle();

  if (!doc?.profile_id || !args.allowedProfileIds.includes(doc.profile_id)) {
    return null;
  }

  const profileName = args.profileNames[doc.profile_id];
  const isImage = isImageMimeType(doc.mime_type);

  let { data: chunkRows } = await supabase
    .from("document_chunks")
    .select("id, document_id, file_name, content, chunk_index, profile_id")
    .eq("document_id", doc.id)
    .order("chunk_index", { ascending: true });

  const extractedSelect =
    "summary, facts, title, document_type, warnings, specialist, source_text, vision_status, vision_summary, vision_transcription";
  let extractedQuery = await supabase
    .from("extracted_data")
    .select(extractedSelect)
    .eq("document_id", doc.id)
    .maybeSingle();
  if (extractedQuery.error && /vision_|schema cache/i.test(extractedQuery.error.message)) {
    extractedQuery = await supabase
      .from("extracted_data")
      .select(
        "summary, facts, title, document_type, warnings, specialist, source_text"
      )
      .eq("document_id", doc.id)
      .maybeSingle();
  }
  const extracted = extractedQuery.data as {
    summary?: string | null;
    facts?: unknown;
    title?: string | null;
    document_type?: string | null;
    warnings?: unknown;
    specialist?: unknown;
    source_text?: string | null;
    vision_status?: string | null;
    vision_summary?: string | null;
    vision_transcription?: string | null;
  } | null;

  const sourceText =
    extracted?.vision_transcription?.trim() ||
    extracted?.source_text?.trim() ||
    extracted?.vision_summary?.trim() ||
    null;

  if ((!chunkRows || chunkRows.length === 0) && extracted) {
    try {
      await indexDocumentForVault({
        supabase,
        userId: args.userId,
        profileId: doc.profile_id,
        documentId: doc.id,
        fileName: doc.file_name,
        source: {
          title: extracted.title,
          summary: extracted.summary,
          documentType: extracted.document_type,
          facts: Array.isArray(extracted.facts)
            ? (extracted.facts as {
                label?: string;
                value?: string;
                source?: string;
              }[])
            : null,
          warnings: Array.isArray(extracted.warnings)
            ? (extracted.warnings as string[])
            : null,
          specialist:
            extracted.specialist && typeof extracted.specialist === "object"
              ? (extracted.specialist as Record<string, unknown>)
              : null,
          sourceText: extracted.source_text,
          contentType: isImage ? "image" : undefined,
        },
      });
      const retry = await supabase
        .from("document_chunks")
        .select("id, document_id, file_name, content, chunk_index, profile_id")
        .eq("document_id", doc.id)
        .order("chunk_index", { ascending: true });
      chunkRows = retry.data ?? [];
    } catch (err) {
      console.error(
        "Attached document index failed:",
        err instanceof Error ? err.message : "error"
      );
    }
  }

  let imageBase64: string | null = null;
  let mimeType = doc.mime_type;
  if (isImage && doc.file_path) {
    const { data: file, error } = await supabase.storage
      .from("documents")
      .download(doc.file_path);
    if (!error && file) {
      const raw = Buffer.from(await file.arrayBuffer()).toString("base64");
      try {
        const prepared = await prepareImageForVision({
          mimeType: doc.mime_type,
          base64: raw,
          fileName: doc.file_name,
        });
        imageBase64 = prepared.base64;
        mimeType = prepared.mimeType;
      } catch {
        imageBase64 = raw;
      }
    }
  }

  return {
    documentId: doc.id,
    fileName: doc.file_name,
    mimeType,
    profileId: doc.profile_id,
    profileName,
    isImage,
    sourceText,
    chunks: toPinnedChunks(chunkRows ?? [], profileName),
    imageBase64,
    analysisStatus: doc.analysis_status ?? null,
    visionStatus: extracted?.vision_status ?? null,
    visionSummary: extracted?.vision_summary ?? extracted?.summary ?? null,
  };
}
