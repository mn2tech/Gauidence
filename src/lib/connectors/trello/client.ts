import "server-only";

const TRELLO_API = "https://api.trello.com/1";

export type TrelloCredentials = {
  apiKey: string;
  token: string;
};

export type TrelloMember = {
  id: string;
  username: string;
  fullName: string;
  url?: string;
};

export type TrelloBoardSummary = {
  id: string;
  name: string;
  desc?: string;
  url?: string;
  shortUrl?: string;
  shortLink?: string;
  closed?: boolean;
  dateLastActivity?: string;
};

export class TrelloApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TrelloApiError";
    this.status = status;
  }
}

async function trelloFetch<T>(
  creds: TrelloCredentials,
  path: string,
  query?: Record<string, string>
): Promise<T> {
  const params = new URLSearchParams({
    key: creds.apiKey,
    token: creds.token,
    ...(query ?? {}),
  });
  const url = `${TRELLO_API}${path}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TrelloApiError(
      res.status,
      text.slice(0, 200) || `Trello API error (${res.status})`
    );
  }
  return (await res.json()) as T;
}

export async function verifyTrelloCredentials(
  creds: TrelloCredentials
): Promise<TrelloMember> {
  const me = await trelloFetch<{
    id: string;
    username?: string;
    fullName?: string;
    url?: string;
  }>(creds, "/members/me", {
    fields: "id,username,fullName,url",
  });
  return {
    id: me.id,
    username: me.username ?? "trello-user",
    fullName: me.fullName ?? me.username ?? "Trello user",
    url: me.url,
  };
}

export async function listTrelloBoards(
  creds: TrelloCredentials
): Promise<TrelloBoardSummary[]> {
  const boards = await trelloFetch<TrelloBoardSummary[]>(
    creds,
    "/members/me/boards",
    {
      fields: "id,name,desc,url,shortUrl,shortLink,closed,dateLastActivity",
      filter: "open",
    }
  );
  return Array.isArray(boards) ? boards : [];
}

/**
 * Fetch a board export payload suitable for Guardian analysis
 * (lists + cards + members + checklists; skip heavy action history).
 */
export async function fetchTrelloBoardExport(
  creds: TrelloCredentials,
  boardId: string
): Promise<Record<string, unknown>> {
  const board = await trelloFetch<Record<string, unknown>>(
    creds,
    `/boards/${encodeURIComponent(boardId)}`,
    {
      fields:
        "id,name,desc,url,shortUrl,shortLink,closed,dateLastActivity,labelNames",
      lists: "open",
      list_fields: "id,name,closed,pos",
      cards: "open",
      card_fields:
        "id,idList,name,desc,due,dueComplete,labels,idMembers,closed,url,shortUrl,badges",
      card_attachments: "true",
      members: "all",
      member_fields: "id,fullName,username",
      checklists: "all",
      checklist_fields: "id,name,idCard",
      checkItems: "all",
      checkItem_fields: "id,name,state",
      organization: "false",
    }
  );
  return board;
}

/** Open cards on a board with attachment metadata (for PDF discovery). */
export async function listTrelloBoardCardsWithAttachments(
  creds: TrelloCredentials,
  boardId: string
): Promise<unknown[]> {
  const cards = await trelloFetch<unknown[]>(
    creds,
    `/boards/${encodeURIComponent(boardId)}/cards`,
    {
      filter: "open",
      fields: "id,name,closed,idList",
      attachments: "true",
      attachment_fields: "id,name,url,mimeType,bytes,date,fileName",
    }
  );
  return Array.isArray(cards) ? cards : [];
}

/**
 * Download an uploaded Trello attachment (PDF, etc.).
 * Prefer the authenticated download endpoint; fall back to the attachment URL.
 */
export async function downloadTrelloAttachment(
  creds: TrelloCredentials,
  args: {
    cardId: string;
    attachmentId: string;
    fileName: string;
    url?: string;
  }
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const safeName = encodeURIComponent(
    args.fileName.replace(/[^\w.\- ()[\]]+/g, "_") || "attachment.pdf"
  );
  const downloadPath = `/cards/${encodeURIComponent(args.cardId)}/attachments/${encodeURIComponent(args.attachmentId)}/download/${safeName}`;
  const params = new URLSearchParams({
    key: creds.apiKey,
    token: creds.token,
  });

  const tryUrls = [
    `${TRELLO_API}${downloadPath}?${params.toString()}`,
    args.url
      ? args.url.includes("?")
        ? `${args.url}&${params.toString()}`
        : `${args.url}?${params.toString()}`
      : null,
  ].filter(Boolean) as string[];

  let lastStatus = 0;
  let lastText = "";
  for (const url of tryUrls) {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "*/*" },
      cache: "no-store",
      redirect: "follow",
    });
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      const contentType =
        res.headers.get("content-type")?.split(";")[0]?.trim() ||
        "application/pdf";
      return { bytes: buf, contentType };
    }
    lastStatus = res.status;
    lastText = await res.text().catch(() => "");
  }

  throw new TrelloApiError(
    lastStatus || 502,
    lastText.slice(0, 200) ||
      `Couldn't download Trello attachment (${lastStatus || "error"})`
  );
}

export { formatBoardAsAnalysisText } from "./formatBoard";
