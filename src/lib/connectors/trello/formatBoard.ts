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

  // Compact index FIRST so ontology truncation still keeps every song/card name.
  lines.push(
    `CARD INDEX (${openCards.length} items — treat each as a song/document entity when this is a music board):`
  );
  for (const card of openCards) {
    if (!card || typeof card !== "object") continue;
    const row = card as Record<string, unknown>;
    const list = listName.get(String(row.idList ?? "")) ?? "Unknown list";
    lines.push(`* [${list}] ${String(row.name ?? "Untitled")}`);
  }
  lines.push("Card details:");

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
    if (desc) pushIndentedBlock(lines, desc, 2500);
    const checklists = checklistsForCard(board, String(row.id ?? ""));
    for (const cl of checklists) {
      lines.push(`  checklist "${cl.name}":`);
      for (const item of cl.items) {
        lines.push(`    - ${item}`);
      }
    }
    const attachments = Array.isArray(row.attachments) ? row.attachments : [];
    for (const raw of attachments.slice(0, 12)) {
      if (!raw || typeof raw !== "object") continue;
      const att = raw as Record<string, unknown>;
      const attName = String(att.name ?? att.fileName ?? "attachment").trim();
      const mime = typeof att.mimeType === "string" ? att.mimeType : "";
      const kind = mime.includes("pdf")
        ? "PDF"
        : mime.startsWith("image/")
          ? "image"
          : /\.pdf$/i.test(attName)
            ? "PDF"
            : "file";
      const attUrl =
        (typeof att.url === "string" && att.url) ||
        (typeof att.fileUrl === "string" && att.fileUrl) ||
        "";
      lines.push(
        attUrl
          ? `  attachment (${kind}): ${attName} — ${attUrl}`
          : `  attachment (${kind}): ${attName}`
      );
    }
    if (attachments.length > 12) {
      lines.push(`  …[${attachments.length - 12} more attachments]`);
    }
    if (lines.join("\n").length > maxChars) {
      lines.push(`…[truncated; ${openCards.length} open cards total]`);
      break;
    }
  }

  return lines.join("\n");
}

function pushIndentedBlock(
  lines: string[],
  text: string,
  maxChars: number
): void {
  let used = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const chunk = line.slice(0, 240);
    if (used + chunk.length > maxChars) break;
    lines.push(`  ${chunk}`);
    used += chunk.length + 1;
  }
}

function checklistsForCard(
  board: Record<string, unknown>,
  cardId: string
): Array<{ name: string; items: string[] }> {
  if (!cardId) return [];
  const lists = Array.isArray(board.checklists) ? board.checklists : [];
  const out: Array<{ name: string; items: string[] }> = [];
  for (const raw of lists) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (String(row.idCard ?? "") !== cardId) continue;
    const items = Array.isArray(row.checkItems) ? row.checkItems : [];
    const names = items
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i) => String(i.name ?? "").trim())
      .filter(Boolean)
      .slice(0, 40);
    out.push({
      name: String(row.name ?? "Checklist"),
      items: names,
    });
  }
  return out;
}
