import "server-only";

import type { ConnectedSource, SourceItem } from "../types";
import {
  fetchTrelloBoardExport,
  listTrelloBoards,
  type TrelloCredentials,
  verifyTrelloCredentials,
} from "./client";
import { formatBoardAsAnalysisText } from "./formatBoard";

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
    throw new Error("Trello credentials are missing. Reconnect with your API key and token.");
  }

  const boards = await listTrelloBoards(creds);
  return boards.map((board) => {
    const uri =
      board.url ||
      board.shortUrl ||
      (board.shortLink
        ? `https://trello.com/b/${board.shortLink}`
        : `trello://board/${board.id}`);
    return {
      sourceId: source.id,
      externalId: board.id,
      name: board.name || "Untitled board",
      mimeType: "application/json",
      sourceUri: uri,
      modifiedAt: board.dateLastActivity ?? undefined,
      metadata: {
        provider: "trello",
        kind: "board",
        shortLink: board.shortLink ?? null,
        closed: board.closed ?? false,
        desc: typeof board.desc === "string" ? board.desc.slice(0, 280) : null,
      },
      processingStatus: "discovered" as const,
    };
  });
}

export async function loadTrelloBoardAnalysisContent(
  source: ConnectedSource,
  boardId: string
): Promise<{ text: string; filename: string; mimeType: string; bytes: Uint8Array }> {
  const creds = getTrelloCredentials(source);
  if (!creds) {
    throw new Error("Trello credentials are missing.");
  }
  const board = await fetchTrelloBoardExport(creds, boardId);
  const text = formatBoardAsAnalysisText(board);
  const filename = `${String(board.name ?? "trello-board").replace(/[^\w.\- ]+/g, "_")}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(board));
  return {
    text,
    filename,
    mimeType: "application/json",
    bytes,
  };
}

export { verifyTrelloCredentials };
