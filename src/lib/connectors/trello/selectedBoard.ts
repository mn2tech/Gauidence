/** Which Trello board Scan/Analyze should use. Stored on connection settings. */

export function trelloSelectedBoardId(
  settings?: Record<string, unknown> | null
): string | null {
  const id = String(settings?.boardId ?? "").trim();
  return id || null;
}

export function trelloSelectedBoardName(
  settings?: Record<string, unknown> | null
): string | null {
  const name = String(settings?.boardName ?? "").trim();
  return name || null;
}

export function boardsForTrelloScan<T extends { id: string }>(
  boards: T[],
  selectedBoardId: string | null
): T[] {
  if (!selectedBoardId) return boards;
  const match = boards.filter((board) => board.id === selectedBoardId);
  if (!match.length) {
    throw new Error(
      "The selected Trello board is no longer available. Pick another board."
    );
  }
  return match;
}

export function sortTrelloBoardsForPicker<T extends { name: string }>(
  boards: T[]
): T[] {
  const rank = (name: string) => {
    const n = name.trim().toLowerCase();
    if (n === "living waters") return 0;
    if (/\bliving\s+waters\b/.test(n)) return 1;
    if (/\bwednesday\s*practice\b/.test(n)) return 2;
    return 3;
  };
  return [...boards].sort((a, b) => {
    const delta = rank(a.name) - rank(b.name);
    if (delta !== 0) return delta;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function itemBelongsToTrelloBoard(
  item: {
    externalId?: string;
    processingStatus?: string;
    metadata?: Record<string, unknown> | null;
  },
  selectedBoardId: string | null
): boolean {
  if (item.processingStatus === "unavailable") return false;
  const kind = String(item.metadata?.kind ?? "");
  if (kind !== "board" && kind !== "attachment") return false;
  if (!selectedBoardId) return true;
  if (kind === "board") return item.externalId === selectedBoardId;
  return String(item.metadata?.boardId ?? "") === selectedBoardId;
}
