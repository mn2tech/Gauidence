/** Pure Trello board → analysis text (safe for unit tests). */

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
