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

function authQuery(creds: TrelloCredentials): string {
  const params = new URLSearchParams({
    key: creds.apiKey,
    token: creds.token,
  });
  return params.toString();
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
      fields: "id,name,desc,url,shortUrl,shortLink,closed,dateLastActivity,labelNames",
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

export function formatBoardAsAnalysisText(
  board: Record<string, unknown>
): string {
  const name = String(board.name ?? "Untitled board");
  const lines: string[] = [`Trello board: ${name}`];
  const url = board.url ?? board.shortUrl;
  if (typeof url === "string" && url) lines.push(`URL: ${url}`);
  if (typeof board.desc === "string" && board.desc.trim()) {
    lines.push(`Description: ${board.desc.trim().slice(0, 500)}`);
  }

  const lists = Array.isArray(board.lists) ? board.lists : [];
  const listName = new Map<string, string>();
  for (const list of lists) {
    if (!list || typeof list !== "object") continue;
    const row = list as Record<string, unknown>;
    if (typeof row.id === "string") {
      listName.set(row.id, String(row.name ?? "Untitled list"));
    }
  }
  const listNames = [...listName.values()];
  if (listNames.length) {
    lines.push(`Lists (${listNames.length}): ${listNames.join(", ")}`);
  }

  const members = Array.isArray(board.members) ? board.members : [];
  const memberNames = members
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => String(m.fullName ?? m.username ?? ""))
    .filter(Boolean);
  if (memberNames.length) {
    lines.push(`Members: ${memberNames.join(", ")}`);
  }

  const cards = Array.isArray(board.cards) ? board.cards : [];
  const openCards = cards.filter((c) => {
    if (!c || typeof c !== "object") return false;
    return (c as Record<string, unknown>).closed !== true;
  });
  lines.push(`Cards (${openCards.length} open / ${cards.length} total):`);

  const maxChars = 80_000;
  for (const card of openCards) {
    if (!card || typeof card !== "object") continue;
    const row = card as Record<string, unknown>;
    const list = listName.get(String(row.idList ?? "")) ?? "Unknown list";
    const labels = Array.isArray(row.labels)
      ? row.labels
          .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
          .map((l) => String(l.name ?? ""))
          .filter(Boolean)
          .join(", ")
      : "";
    const due = row.due ? ` | due ${String(row.due).slice(0, 10)}` : "";
    const labelBit = labels ? ` | labels: ${labels}` : "";
    lines.push(
      `- [${list}] ${String(row.name ?? "Untitled")}${due}${labelBit}`
    );
    const desc = String(row.desc ?? "").trim();
    if (desc) lines.push(`  ${desc.slice(0, 280).replace(/\s+/g, " ")}`);
    if (lines.join("\n").length > maxChars) {
      lines.push(`…[truncated; ${openCards.length} open cards total]`);
      break;
    }
  }

  return lines.join("\n");
}

/** @internal test helper — auth query shape */
export function __testAuthQuery(creds: TrelloCredentials): string {
  return authQuery(creds);
}
