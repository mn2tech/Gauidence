import { isImageFileName, isImageMimeType } from "@/lib/vault/images";

export type ChatCitationLike = {
  documentId?: string | null;
  fileName?: string | null;
  isImage?: boolean;
  mimeType?: string | null;
};

export type ChatMessageLike = {
  role: string;
  content?: string;
  citations?: ChatCitationLike[] | null;
};

const VISUAL_QUESTION =
  /\b(this|the|that)\s+(image|photo|picture|pic|screenshot|receipt|invoice|note|letter|scan|document|flyer)|what (is|does) this|read this|how much did i (spend|pay)|what date is on this|what service|handwritten|screenshot\b/i;

const REUPLOAD_REQUEST =
  /\b(re-?upload|upload (it|the (image|photo|file|picture)) again|if you (re-?)?upload)\b/i;

export function wantsVisualUnderstanding(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  return VISUAL_QUESTION.test(q);
}

export function isImageCitation(citation: ChatCitationLike): boolean {
  if (citation.isImage) return true;
  if (isImageMimeType(citation.mimeType)) return true;
  if (isImageFileName(citation.fileName)) return true;
  return false;
}

export function lastImageAttachmentId(
  messages: ChatMessageLike[] | null | undefined
): string | null {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role !== "user") continue;
    const citations = Array.isArray(message.citations) ? message.citations : [];
    for (const citation of citations) {
      const id = citation.documentId?.trim();
      if (id && isImageCitation(citation)) return id;
    }
  }
  return null;
}

/**
 * Prefer the explicit request attachment, then a recent chat image,
 * then nothing (caller may still retrieve Space images).
 */
export function resolveGideonImageAttachmentId(args: {
  requestedId?: string | null;
  question: string;
  priorMessages?: ChatMessageLike[] | null;
}): string | null {
  const requested = args.requestedId?.trim() || null;
  if (requested) return requested;

  const lastId = lastImageAttachmentId(args.priorMessages);
  if (!lastId) return null;

  if (wantsVisualUnderstanding(args.question)) return lastId;

  const lastUser = [...(args.priorMessages ?? [])]
    .reverse()
    .find((m) => m.role === "user");
  const lastHadImage = (lastUser?.citations ?? []).some(
    (c) => c.documentId && isImageCitation(c)
  );
  if (lastHadImage) return lastId;

  return null;
}

export function uniqueImageDocumentIds(ids: Array<string | null | undefined>, limit = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

export function shouldAskForUpload(args: {
  hasAttachment: boolean;
  hasRetrievedImage: boolean;
}): boolean {
  return !args.hasAttachment && !args.hasRetrievedImage;
}

export function mentionsReupload(text: string): boolean {
  return REUPLOAD_REQUEST.test(text);
}

/**
 * When the user already attached an image, only pull extra Space photos into
 * vision if they asked to see/show pictures. Otherwise one upload would also
 * send unrelated past images to the model.
 */
export function shouldAttachRetrievedImages(args: {
  hasAttachedImage: boolean;
  showPictures: boolean;
  /** e.g. "this image" / "this photo" — never expand to a gallery. */
  singleImageFocus?: boolean;
}): boolean {
  if (!args.hasAttachedImage) return true;
  if (args.singleImageFocus) return false;
  return args.showPictures;
}

/** Retrieved image docs to attach (exclude the already-attached current chat image). */
export function selectRetrievedImageDocumentIds(args: {
  chunks: Array<{
    document_id: string;
    file_name: string;
    similarity?: number;
  }>;
  excludeIds?: Iterable<string>;
  limit?: number;
}): string[] {
  const exclude = new Set(
    [...(args.excludeIds ?? [])].map((id) => id.trim()).filter(Boolean)
  );
  const byDoc = new Map<string, number>();
  for (const chunk of args.chunks) {
    if (exclude.has(chunk.document_id)) continue;
    if (!isImageFileName(chunk.file_name)) continue;
    const prev = byDoc.get(chunk.document_id) ?? -1;
    const score = chunk.similarity ?? 0;
    if (score > prev) byDoc.set(chunk.document_id, score);
  }
  return [...byDoc.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, args.limit ?? 2)
    .map(([id]) => id);
}
