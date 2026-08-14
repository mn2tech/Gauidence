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
import { collectChartAttachmentsFromCards } from "./attachments";
import { guessMimeFromName } from "@/lib/connectors/content/types";
import {
  boardsForTrelloScan,
  trelloSelectedBoardId,
} from "./selectedBoard";

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

  const boards = boardsForTrelloScan(
    await listTrelloBoards(creds),
    trelloSelectedBoardId(source.settings)
  );
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
      const charts = collectChartAttachmentsFromCards({
        boardId: board.id,
        boardName: board.name || "Untitled board",
        cards,
      });
      for (const chart of charts) {
        items.push({
          sourceId: source.id,
          externalId: `att:${chart.attachmentId}`,
          name: chart.name,
          mimeType: chart.mimeType,
          sourceUri:
            chart.url ||
            `trello://card/${chart.cardId}/attachment/${chart.attachmentId}`,
          sizeBytes: chart.bytes,
          modifiedAt: chart.date,
          metadata: {
            provider: "trello",
            kind: "attachment",
            attachmentId: chart.attachmentId,
            cardId: chart.cardId,
            cardName: chart.cardName,
            boardId: chart.boardId,
            boardName: chart.boardName,
          },
          processingStatus: "discovered",
        });
      }
    } catch (err) {
      // Board listing still succeeds if one board's attachments fail.
      console.warn(
        "Trello chart attachment scan failed for board",
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
  const fileName = item.name || "attachment";
  const url = typeof meta.url === "string" ? meta.url : undefined;
  const downloaded = await downloadTrelloAttachment(creds, {
    cardId,
    attachmentId,
    fileName,
    url,
  });
  const fromHeader = downloaded.contentType.split(";")[0]?.trim() || "";
  const mimeType =
    fromHeader.startsWith("image/") || fromHeader === "application/pdf"
      ? fromHeader === "image/jpg"
        ? "image/jpeg"
        : fromHeader
      : guessMimeFromName(fileName);
  return {
    filename: fileName,
    mimeType: mimeType || "application/octet-stream",
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
