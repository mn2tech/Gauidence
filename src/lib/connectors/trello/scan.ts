import "server-only";

import type { ConnectedSource, SourceItem } from "../types";
import {
  downloadTrelloAttachment,
  fetchTrelloBoardExport,
  listTrelloBoardCardsWithAttachments,
  listTrelloBoards,
  type TrelloCredentials,
  verifyTrelloCredentials,
} from "./client";
import { formatBoardAsAnalysisText } from "./formatBoard";
import { collectPdfAttachmentsFromCards } from "./attachments";

export function getTrelloCredentials(
  source: Pick<ConnectedSource, "settings">
): TrelloCredentials | null {
  const apiKey = String(source.settings?.apiKey ?? "").trim();
  const token = String(source.settings?.token ?? "").trim();
  if (!apiKey || !token) return null;
  return { apiKey, token };
}

/** Strip secrets before sending connected sources to the browser. */
export function redactConnectedSourceSettings(
  sourceType: string,
  settings: Record<string, unknown>
): Record<string, unknown> {
  if (sourceType !== "trello") return settings;
  const {
    apiKey: _k,
    token: _t,
    secret: _s,
    ...safe
  } = settings;
  return {
    ...safe,
    hasCredentials: Boolean(
      String(settings.apiKey ?? "").trim() && String(settings.token ?? "").trim()
    ),
  };
}

export async function scanTrelloSource(
  source: ConnectedSource
): Promise<SourceItem[]> {
  const creds = getTrelloCredentials(source);
  if (!creds) {
    throw new Error(
      "Trello credentials are missing. Reconnect with your API key and token."
    );
  }

  const boards = await listTrelloBoards(creds);
  const items: SourceItem[] = [];

  for (const board of boards) {
    const uri =
      board.url ||
      board.shortUrl ||
      (board.shortLink
        ? `https://trello.com/b/${board.shortLink}`
        : `trello://board/${board.id}`);
    items.push({
      sourceId: source.id,
      externalId: board.id,
      name: board.name || "Untitled board",
      mimeType: "text/plain",
      sourceUri: uri,
      modifiedAt: board.dateLastActivity ?? undefined,
      metadata: {
        provider: "trello",
        kind: "board",
        shortLink: board.shortLink ?? null,
        closed: board.closed ?? false,
        desc: typeof board.desc === "string" ? board.desc.slice(0, 280) : null,
      },
      processingStatus: "discovered",
    });

    try {
      const cards = await listTrelloBoardCardsWithAttachments(creds, board.id);
      const pdfs = collectPdfAttachmentsFromCards({
        boardId: board.id,
        boardName: board.name || "Untitled board",
        cards,
      });
      for (const pdf of pdfs) {
        items.push({
          sourceId: source.id,
          externalId: `att:${pdf.attachmentId}`,
          name: pdf.name,
          mimeType: "application/pdf",
          sourceUri:
            pdf.url ||
            `trello://card/${pdf.cardId}/attachment/${pdf.attachmentId}`,
          sizeBytes: pdf.bytes,
          modifiedAt: pdf.date,
          metadata: {
            provider: "trello",
            kind: "attachment",
            attachmentId: pdf.attachmentId,
            cardId: pdf.cardId,
            cardName: pdf.cardName,
            boardId: pdf.boardId,
            boardName: pdf.boardName,
          },
          processingStatus: "discovered",
        });
      }
    } catch (err) {
      // Board listing still succeeds if one board's attachments fail.
      console.warn(
        "Trello PDF attachment scan failed for board",
        board.id,
        err instanceof Error ? err.message : err
      );
    }
  }

  return items;
}

export async function loadTrelloBoardAnalysisContent(
  source: ConnectedSource,
  boardId: string
): Promise<{
  text: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}> {
  const creds = getTrelloCredentials(source);
  if (!creds) {
    throw new Error("Trello credentials are missing.");
  }
  const board = await fetchTrelloBoardExport(creds, boardId);
  const text = formatBoardAsAnalysisText(board);
  const filename = `${String(board.name ?? "trello-board").replace(/[^\w.\- ]+/g, "_")}.txt`;
  // Hash/analyze the formatted text — not the raw board JSON (can be huge).
  const bytes = new TextEncoder().encode(text);
  return {
    text,
    filename,
    mimeType: "text/plain",
    bytes,
  };
}

export async function loadTrelloAttachmentAnalysisContent(
  source: ConnectedSource,
  item: {
    name: string;
    metadata?: Record<string, unknown> | null;
  }
): Promise<{
  text?: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}> {
  const creds = getTrelloCredentials(source);
  if (!creds) {
    throw new Error("Trello credentials are missing.");
  }
  const meta = item.metadata ?? {};
  const cardId = String(meta.cardId ?? "").trim();
  const attachmentId = String(meta.attachmentId ?? "").trim();
  if (!cardId || !attachmentId) {
    throw new Error("This Trello attachment is missing card/attachment ids. Scan again.");
  }
  const fileName = item.name || "attachment.pdf";
  const url = typeof meta.url === "string" ? meta.url : undefined;
  // Prefer URL from source item if present in metadata via scan — we store url in sourceUri.
  const downloaded = await downloadTrelloAttachment(creds, {
    cardId,
    attachmentId,
    fileName,
    url,
  });
  return {
    filename: fileName,
    mimeType: downloaded.contentType.includes("pdf")
      ? "application/pdf"
      : downloaded.contentType || "application/pdf",
    bytes: downloaded.bytes,
  };
}

export async function loadTrelloItemAnalysisContent(
  source: ConnectedSource,
  item: {
    externalId: string;
    name: string;
    mimeType?: string;
    sourceUri?: string;
    metadata?: Record<string, unknown> | null;
  }
): Promise<{
  text?: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}> {
  const kind = String(item.metadata?.kind ?? "");
  if (kind === "attachment") {
    const loaded = await loadTrelloAttachmentAnalysisContent(source, {
      name: item.name,
      metadata: {
        ...(item.metadata ?? {}),
        url: item.sourceUri,
      },
    });
    return loaded;
  }
  return loadTrelloBoardAnalysisContent(source, item.externalId);
}

export { verifyTrelloCredentials };
