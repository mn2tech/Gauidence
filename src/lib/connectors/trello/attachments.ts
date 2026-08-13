/** Pure helpers for Trello attachment discovery (safe for unit tests). */

export type TrelloAttachmentRef = {
  attachmentId: string;
  cardId: string;
  cardName: string;
  boardId: string;
  boardName: string;
  name: string;
  mimeType: string;
  url: string;
  bytes?: number;
  date?: string;
};

export function isPdfAttachment(args: {
  name?: string | null;
  mimeType?: string | null;
  url?: string | null;
}): boolean {
  const mime = (args.mimeType ?? "").toLowerCase();
  if (mime === "application/pdf" || mime.includes("pdf")) return true;
  const name = (args.name ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return true;
  const url = (args.url ?? "").toLowerCase();
  return /\.pdf(\?|#|$)/i.test(url);
}

export function collectPdfAttachmentsFromCards(args: {
  boardId: string;
  boardName: string;
  cards: unknown[];
}): TrelloAttachmentRef[] {
  const out: TrelloAttachmentRef[] = [];
  for (const card of args.cards) {
    if (!card || typeof card !== "object") continue;
    const row = card as Record<string, unknown>;
    if (row.closed === true) continue;
    const cardId = typeof row.id === "string" ? row.id : "";
    if (!cardId) continue;
    const cardName = String(row.name ?? "Untitled card");
    const attachments = Array.isArray(row.attachments) ? row.attachments : [];
    for (const raw of attachments) {
      if (!raw || typeof raw !== "object") continue;
      const att = raw as Record<string, unknown>;
      const attachmentId = typeof att.id === "string" ? att.id : "";
      if (!attachmentId) continue;
      const name = String(att.name ?? att.fileName ?? "attachment.pdf");
      const mimeType = String(att.mimeType ?? "");
      const url = String(att.url ?? att.fileUrl ?? "");
      if (!isPdfAttachment({ name, mimeType, url })) continue;
      out.push({
        attachmentId,
        cardId,
        cardName,
        boardId: args.boardId,
        boardName: args.boardName,
        name,
        mimeType: mimeType || "application/pdf",
        url,
        bytes:
          typeof att.bytes === "number" && Number.isFinite(att.bytes)
            ? Math.max(0, Math.floor(att.bytes))
            : undefined,
        date: typeof att.date === "string" ? att.date : undefined,
      });
    }
  }
  return out;
}
