import { isImageFileName, isImageMimeType } from "./images";
import type { VaultChatCitation } from "./vaultChatStream";
import { parseSuggestedQuestions } from "@/lib/gideon/suggestedQuestions";

/** Persistent chat attachment pointing at a Guardian document (not a blob URL). */
export type ChatMessageAttachment = {
  documentId: string;
  fileName: string;
  kind: "image" | "document";
  mimeType?: string | null;
  previewUrl?: string | null;
};

export type HydratableChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: VaultChatCitation[] | null;
  suggestedQuestions?: string[] | null;
  suggested_questions?: unknown;
  attachment?: ChatMessageAttachment | null;
  attachments?: ChatMessageAttachment[] | null;
  created_at: string;
};

export function isImageAttachmentCitation(
  citation: Pick<VaultChatCitation, "fileName" | "isImage" | "mimeType">
): boolean {
  return (
    Boolean(citation.isImage) ||
    isImageMimeType(citation.mimeType) ||
    isImageFileName(citation.fileName)
  );
}

/** Vault documents attached to a user turn — skip connector/source citations. */
export function attachmentsFromUserCitations(
  citations: VaultChatCitation[] | null | undefined
): ChatMessageAttachment[] {
  const out: ChatMessageAttachment[] = [];
  const seen = new Set<string>();
  for (const citation of citations ?? []) {
    const documentId = citation.documentId?.trim();
    if (!documentId || citation.kind === "connector") continue;
    if (seen.has(documentId)) continue;
    seen.add(documentId);
    out.push({
      documentId,
      fileName: citation.fileName,
      kind: isImageAttachmentCitation(citation) ? "image" : "document",
      mimeType: citation.mimeType ?? null,
    });
  }
  return out;
}

export function citationFromDocument(doc: {
  id: string;
  file_name: string;
  mime_type?: string | null;
}): VaultChatCitation {
  const mimeType = doc.mime_type ?? null;
  return {
    documentId: doc.id,
    fileName: doc.file_name,
    isImage: isImageMimeType(mimeType) || isImageFileName(doc.file_name),
    mimeType,
  };
}

function mergeAttachments(
  primary: ChatMessageAttachment[],
  overlay: ChatMessageAttachment[]
): ChatMessageAttachment[] {
  const byId = new Map<string, ChatMessageAttachment>();
  for (const item of primary) {
    if (!item.documentId) continue;
    byId.set(item.documentId, item);
  }
  for (const item of overlay) {
    if (!item.documentId) continue;
    const prev = byId.get(item.documentId);
    byId.set(item.documentId, {
      ...prev,
      ...item,
      previewUrl: item.previewUrl ?? prev?.previewUrl ?? null,
      mimeType: item.mimeType ?? prev?.mimeType ?? null,
    });
  }
  return [...byId.values()];
}

/**
 * User messages keep attachments from persisted citations (document ids).
 * Composer blob previews may overlay previewUrl but never replace documentId.
 */
export function hydrateVaultChatMessage<T extends HydratableChatMessage>(
  message: T
): T {
  const suggestedQuestions = parseSuggestedQuestions(
    message.suggestedQuestions ?? message.suggested_questions
  );

  if (message.role !== "user") {
    return {
      ...message,
      attachments: message.attachments ?? [],
      attachment: message.attachment ?? null,
      suggestedQuestions:
        suggestedQuestions.length > 0 ? suggestedQuestions : undefined,
    } as T;
  }

  const fromCitations = attachmentsFromUserCitations(message.citations);
  const existing = message.attachments?.length
    ? message.attachments
    : message.attachment
      ? [message.attachment]
      : [];
  const attachments = mergeAttachments(fromCitations, existing);
  return {
    ...message,
    attachments,
    attachment: attachments[0] ?? null,
    suggestedQuestions:
      suggestedQuestions.length > 0 ? suggestedQuestions : undefined,
  } as T;
}

export function hydrateVaultChatMessages<T extends HydratableChatMessage>(
  messages: T[]
): T[] {
  return messages.map((message) => hydrateVaultChatMessage(message));
}
