import type { OntologyExtractionResult } from "../types";

export type TrelloParsedSong = {
  list: string;
  name: string;
  songTitle: string;
  key: string | null;
  practicedOn: string | null;
  notes: string;
  attachments: string[];
};

/** Pull the CARD INDEX block from formatted Trello board text. */
export function extractTrelloCardIndex(sourceText: string): string | null {
  const match = sourceText.match(
    /CARD INDEX[\s\S]*?(?=\nCard details:|\n…\[truncated|$)/i
  );
  const block = match?.[0]?.trim() ?? "";
  return block.length >= 20 ? block.slice(0, 8000) : null;
}

const KEY_RE = /^[A-G](?:#|b)?m?(?:aj7|in7|7|sus4)?$/i;
const DATE_RE =
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i;

/** Split titles like "Ibadat Karo - Gm - Nov 21, 2021" into song + key + date. */
export function parseMusicCardTitle(cardName: string): {
  songTitle: string;
  key: string | null;
  practicedOn: string | null;
} {
  const parts = cardName
    .split(/\s+[-–—]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  let key: string | null = null;
  let practicedOn: string | null = null;
  const titleParts: string[] = [];
  for (const part of parts) {
    if (!key && KEY_RE.test(part)) {
      key = part;
      continue;
    }
    const date = part.match(DATE_RE);
    if (date && !practicedOn) {
      practicedOn = date[0];
      const rest = part.replace(DATE_RE, "").trim();
      if (rest) titleParts.push(rest);
      continue;
    }
    titleParts.push(part);
  }
  return {
    songTitle: (titleParts.join(" - ") || cardName).trim(),
    key,
    practicedOn,
  };
}

/** Parse CARD INDEX + Card details into per-song records (chords live in notes). */
export function parseTrelloBoardSongs(sourceText: string): TrelloParsedSong[] {
  const index = extractTrelloCardIndex(sourceText) ?? "";
  const details = parseCardDetailBlocks(sourceText);
  const songs: TrelloParsedSong[] = [];
  const seen = new Set<string>();

  for (const line of index.split("\n")) {
    const m = line.match(/^\*\s+\[([^\]]+)\]\s+(.+)\s*$/);
    if (!m?.[2]) continue;
    const list = m[1]!.trim();
    const name = m[2].trim();
    if (name.length < 2 || /^untitled$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = parseMusicCardTitle(name);
    const detail = details.get(key);
    songs.push({
      list,
      name,
      songTitle: meta.songTitle,
      key: meta.key,
      practicedOn: meta.practicedOn,
      notes: detail?.notes ?? "",
      attachments: detail?.attachments ?? [],
    });
  }

  return songs;
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

/**
 * When a Trello PDF attachment is analyzed, fold its transcript onto the
 * parent card/song entity so Gideon answers by song name (not only PDF name).
 */
export function mergeTrelloAttachmentOntoSong(
  extraction: OntologyExtractionResult,
  args: { cardName: string; fileName: string }
): OntologyExtractionResult {
  const cardName = args.cardName.trim();
  if (!cardName) return extraction;

  const meta = parseMusicCardTitle(cardName);
  const transcript =
    extraction.entities
      .map((e) => {
        const t = e.attributes?.content_transcript;
        return typeof t === "string" ? t.trim() : "";
      })
      .find((t) => t.length >= 12) ??
    extraction.entities
      .map((e) => (e.description ?? "").trim())
      .find((d) => /chord|chart|verse|chorus|[A-G][#b]?m?\d?/i.test(d)) ??
    "";

  const pdfBase = args.fileName.replace(/\.[^.]+$/, "").trim() || args.fileName;
  const song: TrelloParsedSong = {
    list: "",
    name: cardName,
    songTitle: meta.songTitle,
    key: meta.key,
    practicedOn: meta.practicedOn,
    notes: transcript
      ? `Chord chart PDF: ${args.fileName}\n${transcript}`
      : `Chord chart PDF: ${args.fileName}`,
    attachments: [args.fileName],
  };

  const merged = mergeTrelloSongEntities(extraction, [song]);
  const idx = merged.entities.findIndex(
    (e) => e.name.trim().toLowerCase() === cardName.toLowerCase()
  );
  if (idx < 0) return merged;

  const prev = merged.entities[idx]!;
  merged.entities[idx] = {
    ...prev,
    aliases: uniqueStrings([...(prev.aliases ?? []), pdfBase, meta.songTitle]),
    confidence: Math.max(prev.confidence, transcript.length >= 12 ? 0.9 : 0.8),
  };
  return merged;
}

/** Overlay parsed Trello card notes/keys onto song entities. */
export function mergeTrelloSongEntities(
  extraction: OntologyExtractionResult,
  songs: TrelloParsedSong[]
): OntologyExtractionResult {
  const byName = new Map(
    extraction.entities.map((e, i) => [e.name.trim().toLowerCase(), i] as const)
  );
  const entities = [...extraction.entities];

  for (const song of songs) {
    const next = songToEntity(song);
    const idx = byName.get(song.name.trim().toLowerCase());
    if (idx == null) {
      byName.set(song.name.trim().toLowerCase(), entities.length);
      entities.push(next);
      continue;
    }
    const prev = entities[idx]!;
    entities[idx] = {
      ...prev,
      ...next,
      aliases: uniqueStrings([...(prev.aliases ?? []), ...(next.aliases ?? [])]),
      attributes: {
        ...(prev.attributes ?? {}),
        ...(next.attributes ?? {}),
      },
      description: richerText(next.description, prev.description),
      confidence: Math.max(prev.confidence, next.confidence),
    };
  }

  return { ...extraction, entities };
}

function songToEntity(
  song: TrelloParsedSong
): OntologyExtractionResult["entities"][number] {
  const headerBits: string[] = [];
  if (song.key) headerBits.push(`Key ${song.key}`);
  if (song.practicedOn) headerBits.push(`practiced ${song.practicedOn}`);
  if (song.list) headerBits.push(`Trello list ${song.list}`);
  const header = headerBits.length ? `${headerBits.join(". ")}.` : "";
  const notes = song.notes.trim();
  const attachmentLine = song.attachments.length
    ? `Attachments: ${song.attachments.join("; ")}`
    : "";
  const description = [
    header,
    notes ? `Card notes:\n${notes}` : "",
    attachmentLine,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 3500) || `Song/card from Trello board CARD INDEX.`;

  const aliases =
    song.songTitle &&
    song.songTitle.toLowerCase() !== song.name.toLowerCase()
      ? [song.songTitle]
      : [];

  const attributes: Record<string, unknown> = {};
  if (song.key) attributes.musical_key = song.key;
  if (song.practicedOn) attributes.practiced_on = song.practicedOn;
  if (notes.length >= 8) attributes.content_transcript = notes.slice(0, 3500);

  return {
    type: "document",
    name: song.name,
    confidence: notes.length >= 8 ? 0.85 : 0.75,
    description,
    aliases,
    attributes,
  };
}

function parseCardDetailBlocks(
  sourceText: string
): Map<string, { notes: string; attachments: string[] }> {
  const map = new Map<string, { notes: string; attachments: string[] }>();
  const start = sourceText.search(/\nCard details:/i);
  if (start < 0) return map;

  let current: string | null = null;
  const notes: string[] = [];
  const attachments: string[] = [];

  const flush = () => {
    if (!current) return;
    map.set(current, {
      notes: notes.join("\n").trim(),
      attachments: [...attachments],
    });
    notes.length = 0;
    attachments.length = 0;
  };

  for (const line of sourceText.slice(start).split("\n")) {
    const header = line.match(/^- \[([^\]]+)\] (.+?)(?:\s+\|\s+.*)?$/);
    if (header?.[2]) {
      flush();
      current = header[2].trim().toLowerCase();
      continue;
    }
    if (!current) continue;
    if (/^\s+attachment\s*\(/i.test(line)) {
      attachments.push(line.trim().replace(/^attachment\s*\([^)]+\):\s*/i, ""));
      continue;
    }
    if (/^\s{2,}/.test(line)) {
      notes.push(line.replace(/^\s{2}/, ""));
    }
  }
  flush();
  return map;
}

function richerText(preferred?: string, fallback?: string): string {
  const a = preferred?.trim() ?? "";
  const b = fallback?.trim() ?? "";
  if (a.length >= b.length) return a || b;
  return b || a;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}
