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

/** Heavy Trello keys stripped before JSON.parse so large exports do not OOM. */
const STRIP_BEFORE_PARSE = [
  "actions",
  "pluginData",
  "memberships",
  "limits",
  "prefs",
  "powerUps",
  "premiumFeatures",
  "labelNames",
];

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
 * Remove selected top-level object keys before parsing.
 * Used to drop Trello history (`actions`) which can be megabytes.
 */
export function stripTopLevelJsonKeys(
  raw: string,
  keys: string[] = STRIP_BEFORE_PARSE
): string {
  if (!raw || keys.length === 0) return raw;
  const drop = new Set(keys);
  let out = "";
  let i = 0;
  let depth = 0;
  let inString = false;
  let escape = false;

  while (i < raw.length) {
    const ch = raw[i]!;

    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      i += 1;
      continue;
    }

    if (ch === "\"") {
      // Possible key at depth 1: "name" :
      if (depth === 1) {
        const keyMatch = readJsonKey(raw, i);
        if (keyMatch && drop.has(keyMatch.key)) {
          const afterKey = skipWs(raw, keyMatch.end);
          if (raw[afterKey] === ":") {
            const valueStart = skipWs(raw, afterKey + 1);
            const valueEnd = skipJsonValue(raw, valueStart);
            let next = skipWs(raw, valueEnd);
            if (raw[next] === ",") next += 1;
            // Drop trailing comma left before this key if present in out
            out = out.replace(/,\s*$/, "");
            i = next;
            continue;
          }
        }
      }
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
    out += ch;
    i += 1;
  }

  // Clean double commas / trailing commas from removals
  return out
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([}\]])/g, "$1");
}

function readJsonKey(
  raw: string,
  start: number
): { key: string; end: number } | null {
  if (raw[start] !== "\"") return null;
  let i = start + 1;
  let escape = false;
  let key = "";
  while (i < raw.length) {
    const ch = raw[i]!;
    if (escape) {
      key += ch;
      escape = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      i += 1;
      continue;
    }
    if (ch === "\"") return { key, end: i + 1 };
    key += ch;
    i += 1;
  }
  return null;
}

function skipWs(raw: string, start: number): number {
  let i = start;
  while (i < raw.length && /\s/.test(raw[i]!)) i += 1;
  return i;
}

function skipJsonValue(raw: string, start: number): number {
  let i = skipWs(raw, start);
  const ch = raw[i];
  if (ch === "\"" ) {
    i += 1;
    let escape = false;
    while (i < raw.length) {
      const c = raw[i]!;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === "\"") return i + 1;
      i += 1;
    }
    return i;
  }
  if (ch === "{" || ch === "[") {
    const open = ch;
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    while (i < raw.length) {
      const c = raw[i]!;
      if (inString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === "\"") inString = false;
        i += 1;
        continue;
      }
      if (c === "\"") {
        inString = true;
        i += 1;
        continue;
      }
      if (c === open) depth += 1;
      else if (c === close) {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    return i;
  }
  // number, true, false, null
  while (i < raw.length && !/[,}\]\s]/.test(raw[i]!)) i += 1;
  return i;
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

  const stripped = stripTopLevelJsonKeys(trimmed);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch {
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return clipWithNote(trimmed, maxChars);
    }
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
  const attachmentsByCard = attachmentsFromActions(board.actions);
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
    for (const attachment of formatCardAttachments(
      card,
      attachmentsByCard.get(String(card.id ?? ""))
    )) {
      lines.push(attachment);
    }
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

function attachmentsFromActions(actions: unknown): Map<string, unknown[]> {
  const byCard = new Map<string, unknown[]>();
  if (!Array.isArray(actions)) return byCard;
  // Newest actions are usually last; scan a bounded tail for attachment events.
  const start = Math.max(0, actions.length - 8_000);
  for (let i = start; i < actions.length; i++) {
    const action = actions[i];
    if (!isRecord(action)) continue;
    const type = String(action.type ?? "");
    if (!/attachment/i.test(type)) continue;
    const data = isRecord(action.data) ? action.data : null;
    if (!data) continue;
    const card = isRecord(data.card) ? data.card : null;
    const attachment = isRecord(data.attachment) ? data.attachment : null;
    const cardId = card && typeof card.id === "string" ? card.id : "";
    if (!cardId || !attachment) continue;
    const list = byCard.get(cardId) ?? [];
    list.push(attachment);
    byCard.set(cardId, list);
  }
  return byCard;
}

function formatCardAttachments(
  card: Record<string, unknown>,
  actionAttachments?: unknown[]
): string[] {
  const fromCard = Array.isArray(card.attachments) ? card.attachments : [];
  const merged = fromCard.length > 0 ? fromCard : actionAttachments ?? [];
  if (merged.length === 0) return [];
  const lines: string[] = [];
  const limit = 12;
  const shown = merged.slice(0, limit);
  for (const raw of shown) {
    if (!isRecord(raw)) continue;
    const name = String(raw.name ?? raw.fileName ?? "attachment").trim();
    const mime = typeof raw.mimeType === "string" ? raw.mimeType : "";
    const kind = mime.includes("pdf")
      ? "PDF"
      : mime.startsWith("image/")
        ? "image"
        : mime
          ? mime
          : /\.pdf$/i.test(name)
            ? "PDF"
            : "file";
    const url =
      (typeof raw.url === "string" && raw.url) ||
      (typeof raw.fileUrl === "string" && raw.fileUrl) ||
      "";
    lines.push(
      url
        ? `  attachment (${kind}): ${name} — ${url}`
        : `  attachment (${kind}): ${name}`
    );
  }
  if (merged.length > limit) {
    lines.push(`  …[${merged.length - limit} more attachments]`);
  }
  return lines;
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
