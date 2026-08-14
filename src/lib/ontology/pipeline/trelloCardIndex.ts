import type { OntologyExtractionResult } from "../types";

/** Pull the CARD INDEX block from formatted Trello board text. */
export function extractTrelloCardIndex(sourceText: string): string | null {
  const match = sourceText.match(
    /CARD INDEX[\s\S]*?(?=\nCard details:|\n…\[truncated|$)/i
  );
  const block = match?.[0]?.trim() ?? "";
  return block.length >= 20 ? block.slice(0, 8000) : null;
}

/** Ensure every "* [list] Song name" line becomes a document entity. */
export function mergeCardIndexEntities(
  extraction: OntologyExtractionResult,
  cardIndex: string
): OntologyExtractionResult {
  const existing = new Set(
    extraction.entities.map((e) => e.name.trim().toLowerCase())
  );
  const entities = [...extraction.entities];
  for (const line of cardIndex.split("\n")) {
    const m = line.match(/^\*\s+(?:\[[^\]]+\]\s+)?(.+)\s*$/);
    if (!m?.[1]) continue;
    const name = m[1].trim();
    if (name.length < 2) continue;
    const key = name.toLowerCase();
    if (existing.has(key)) continue;
    if (/^untitled$/i.test(name)) continue;
    existing.add(key);
    entities.push({
      type: "document",
      name,
      confidence: 0.7,
      description: `Song/card from Trello board CARD INDEX.`,
    });
  }
  return { ...extraction, entities };
}
