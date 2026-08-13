import { SOURCE_TEXT_MAX_CHARS } from "@/lib/vault/sourceText";

const NOISY_JSON_KEYS = new Set([
  "actions",
  "pluginData",
  "memberships",
  "limits",
  "prefs",
  "powerUps",
  "premiumFeatures",
  "labelNames",
]);

/** Detect JSON documents by MIME or filename. */
export function isJsonMimeOrName(
  mimeType?: string | null,
  fileName?: string | null
): boolean {
  const mime = (mimeType ?? "").toLowerCase().trim();
  if (mime === "application/json" || mime === "text/json") return true;
  return /\.json$/i.test(fileName ?? "");
}

/**
 * Decode JSON into analysis-friendly text.
 * Large exports (e.g. Trello) are compacted and capped so analysis can finish.
 */
export function normalizeJsonText(
  raw: string,
  maxChars: number = SOURCE_TEXT_MAX_CHARS
): string {
  const trimmed = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return clipWithNote(trimmed, maxChars);
  }

  const text = isTrelloBoard(parsed)
    ? formatTrelloBoard(parsed, maxChars)
    : formatGenericJson(parsed);
  return clipWithNote(text, maxChars);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrelloBoard(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || typeof value.name !== "string") return false;
  return Array.isArray(value.cards) && Array.isArray(value.lists);
}

function formatTrelloBoard(
  board: Record<string, unknown>,
  maxChars: number
): string {
  const lists = Array.isArray(board.lists) ? board.lists : [];
  const listName = new Map<string, string>();
  for (const list of lists) {
    if (!isRecord(list) || typeof list.id !== "string") continue;
    listName.set(list.id, String(list.name ?? "Untitled list"));
  }

  const cards = Array.isArray(board.cards) ? board.cards : [];
  const openCards = cards.filter((card) => isRecord(card) && card.closed !== true);
  const members = Array.isArray(board.members) ? board.members : [];
  const checklists = Array.isArray(board.checklists) ? board.checklists : [];

  const lines: string[] = [
    `Trello board: ${board.name}`,
  ];
  const url = board.url ?? board.shortUrl;
  if (typeof url === "string" && url) lines.push(`URL: ${url}`);
  if (typeof board.desc === "string" && board.desc.trim()) {
    lines.push(`Description: ${board.desc.trim().slice(0, 500)}`);
  }
  const listNames = lists
    .filter(isRecord)
    .map((list) => String(list.name ?? ""))
    .filter(Boolean);
  if (listNames.length) {
    lines.push(`Lists (${listNames.length}): ${listNames.join(", ")}`);
  }
  const memberNames = members
    .filter(isRecord)
    .map((member) => String(member.fullName ?? member.username ?? ""))
    .filter(Boolean);
  if (memberNames.length) {
    lines.push(`Members: ${memberNames.join(", ")}`);
  }
  lines.push(
    `Cards (${openCards.length} open / ${cards.length} total):`
  );

  for (const card of openCards) {
    if (!isRecord(card)) continue;
    const list = listName.get(String(card.idList ?? "")) ?? "Unknown list";
    const labels = Array.isArray(card.labels)
      ? card.labels
          .filter(isRecord)
          .map((label) => String(label.name ?? ""))
          .filter(Boolean)
          .join(", ")
      : "";
    const due = card.due ? ` | due ${String(card.due).slice(0, 10)}` : "";
    const labelBit = labels ? ` | labels: ${labels}` : "";
    lines.push(`- [${list}] ${String(card.name ?? "Untitled")}${due}${labelBit}`);
    const desc = String(card.desc ?? "").trim();
    if (desc) lines.push(`  ${desc.slice(0, 280).replace(/\s+/g, " ")}`);
    if (joinedLength(lines) > maxChars) {
      lines.push(`…[truncated; ${openCards.length} open cards total]`);
      break;
    }
  }

  if (joinedLength(lines) < maxChars && checklists.length > 0) {
    lines.push("Checklists:");
    for (const list of checklists) {
      if (!isRecord(list)) continue;
      const items = Array.isArray(list.checkItems) ? list.checkItems : [];
      const done = items.filter(
        (item) => isRecord(item) && item.state === "complete"
      ).length;
      lines.push(
        `- ${String(list.name ?? "Checklist")} (${done}/${items.length} done)`
      );
      if (joinedLength(lines) > maxChars) break;
    }
  }

  return lines.join("\n");
}

function formatGenericJson(value: unknown): string {
  return JSON.stringify(pruneJson(value, 0), null, 2);
}

function pruneJson(value: unknown, depth: number): unknown {
  if (depth > 8) return "[…]";
  if (Array.isArray(value)) {
    const limit = depth === 0 ? 400 : 80;
    const sliced = value.slice(0, limit).map((item) => pruneJson(item, depth + 1));
    if (value.length > limit) {
      sliced.push(`…[${value.length - limit} more items]`);
    }
    return sliced;
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (NOISY_JSON_KEYS.has(key)) continue;
      out[key] = pruneJson(child, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 800) {
    return `${value.slice(0, 800)}…`;
  }
  return value;
}

function joinedLength(lines: string[]): number {
  return lines.reduce((sum, line) => sum + line.length + 1, 0);
}

function clipWithNote(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]`;
}
