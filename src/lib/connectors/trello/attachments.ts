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
  isUpload?: boolean;
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

/** Chord charts on Trello cards are often uploaded JPGs/PNGs, not PDFs. */
export function isImageAttachment(args: {
  name?: string | null;
  mimeType?: string | null;
  url?: string | null;
}): boolean {
  const mime = (args.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = (args.name ?? "").toLowerCase();
  if (/\.(jpe?g|png|webp|gif|heic)$/i.test(name)) return true;
  const url = (args.url ?? "").toLowerCase();
  return /\.(jpe?g|png|webp|gif|heic)(\?|#|$)/i.test(url);
}

export function isChartAttachment(args: {
  name?: string | null;
  mimeType?: string | null;
  url?: string | null;
}): boolean {
  return isPdfAttachment(args) || isImageAttachment(args);
}

export function guessAttachmentMime(args: {
  name?: string | null;
  mimeType?: string | null;
  url?: string | null;
}): string {
  const mime = (args.mimeType ?? "").toLowerCase().trim();
  if (mime.startsWith("image/")) return mime === "image/jpg" ? "image/jpeg" : mime;
  if (mime === "application/pdf" || mime.includes("pdf")) return "application/pdf";
  if (isPdfAttachment(args)) return "application/pdf";
  const name = (args.name ?? "").toLowerCase();
  if (name.endsWith(".png") || (args.url ?? "").toLowerCase().includes(".png")) {
    return "image/png";
  }
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".heic")) return "image/heic";
  if (isImageAttachment(args)) return "image/jpeg";
  return mime || "application/octet-stream";
}

/** Same chart uploaded on multiple cards → one analyze job. */
export function chartDuplicateKey(args: {
  name?: string | null;
  bytes?: number | null;
}): string {
  const name = String(args.name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!name) return "";
  const bytes =
    typeof args.bytes === "number" && Number.isFinite(args.bytes)
      ? Math.max(0, Math.floor(args.bytes))
      : null;
  return bytes == null ? `name:${name}` : `name:${name}|bytes:${bytes}`;
}

function chartDateScore(date?: string): number {
  if (!date) return 0;
  const t = Date.parse(date);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Keep one attachment per duplicate key.
 * Prefer the newest upload; ties keep the first seen.
 */
export function dedupeChartAttachments(
  charts: TrelloAttachmentRef[]
): TrelloAttachmentRef[] {
  const best = new Map<string, TrelloAttachmentRef>();
  for (const chart of charts) {
    const key = chartDuplicateKey({ name: chart.name, bytes: chart.bytes });
    if (!key) continue;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, chart);
      continue;
    }
    if (chartDateScore(chart.date) > chartDateScore(prev.date)) {
      best.set(key, chart);
    }
  }
  // Preserve first-seen order of unique keys.
  const seen = new Set<string>();
  const out: TrelloAttachmentRef[] = [];
  for (const chart of charts) {
    const key = chartDuplicateKey({ name: chart.name, bytes: chart.bytes });
    if (!key || seen.has(key)) continue;
    const winner = best.get(key);
    if (!winner) continue;
    seen.add(key);
    out.push(winner);
  }
  return out;
}

/**
 * Analyze queue: drop duplicates, preferring an already-analyzed copy.
 */
export function pickUniqueChartsForAnalyze<
  T extends {
    name?: string | null;
    sizeBytes?: number | null;
    processingStatus?: string;
  },
>(charts: T[]): T[] {
  const analyzedKeys = new Set<string>();
  for (const chart of charts) {
    if (chart.processingStatus !== "analyzed") continue;
    const key = chartDuplicateKey({
      name: chart.name,
      bytes: chart.sizeBytes,
    });
    if (key) analyzedKeys.add(key);
  }

  const seen = new Set<string>();
  const out: T[] = [];
  for (const chart of charts) {
    const key = chartDuplicateKey({
      name: chart.name,
      bytes: chart.sizeBytes,
    });
    if (!key) {
      out.push(chart);
      continue;
    }
    if (analyzedKeys.has(key) && chart.processingStatus !== "analyzed") {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chart);
  }
  return out;
}

export function collectChartAttachmentsFromCards(args: {
  boardId: string;
  boardName: string;
  cards: unknown[];
  /** When true (default), only files uploaded to Trello — not external links. */
  uploadedOnly?: boolean;
}): TrelloAttachmentRef[] {
  const uploadedOnly = args.uploadedOnly !== false;
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
      const name = String(att.name ?? att.fileName ?? "attachment");
      const mimeType = String(att.mimeType ?? "");
      const url = String(att.url ?? att.fileUrl ?? "");
      if (!isChartAttachment({ name, mimeType, url })) continue;
      if (uploadedOnly && att.isUpload === false) continue;
      out.push({
        attachmentId,
        cardId,
        cardName,
        boardId: args.boardId,
        boardName: args.boardName,
        name,
        mimeType: guessAttachmentMime({ name, mimeType, url }),
        url,
        bytes:
          typeof att.bytes === "number" && Number.isFinite(att.bytes)
            ? Math.max(0, Math.floor(att.bytes))
            : undefined,
        date: typeof att.date === "string" ? att.date : undefined,
        isUpload: att.isUpload !== false,
      });
    }
  }
  return dedupeChartAttachments(out);
}

/** @deprecated Use collectChartAttachmentsFromCards — kept for existing tests. */
export function collectPdfAttachmentsFromCards(args: {
  boardId: string;
  boardName: string;
  cards: unknown[];
  uploadedOnly?: boolean;
}): TrelloAttachmentRef[] {
  return collectChartAttachmentsFromCards(args).filter((a) =>
    isPdfAttachment({ name: a.name, mimeType: a.mimeType, url: a.url })
  );
}
