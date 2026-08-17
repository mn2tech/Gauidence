import {
  isLikelyChordChartFile,
  isNonChordChartNoise,
} from "@/lib/ontology/connectorCitationIds";
import { isImageFileName, isImageMimeType } from "@/lib/vault/images";

export const ASK_VAULT_NAME_PREVIEW = 6;
export const RECENT_VAULT_FILE_PREVIEW = 5;

const INVENTORY_QUESTION_PATTERN =
  /\b(what(?:'s| is| are)?\s+(?:do\s+)?(?:i|we)\s+have\b|what(?:'s| is| are)?\s+(?:in\s+)?(?:the\s+)?(?:vault|space|workspace|uploaded|stored|files?|documents?|photos?)|list\s+(?:all\s+)?(?:files?|documents?|uploads?|photos?)|how\s+many\s+(?:files?|documents?|photos?|uploads?)|show\s+(?:me\s+)?(?:all\s+)?(?:files?|documents?|uploads?)|(?:count|browse|compare)\s+(?:files?|documents?|uploads?)|everything\s+(?:in|uploaded)|file\s+inventory)\b/i;

const SONG_LIST_QUESTION_PATTERN =
  /\b((?:list|show|give(?:\s+me)?)\s+(?:(?:me|us)\s+)?(?:the\s+)?(?:list\s+of\s+)?songs?|what songs|songs (?:are |on |in )|song list|song titles?|which songs)\b/i;

const CHART_FILE_TYPE_LIST_PATTERN =
  /\b((?:list|show|give(?:\s+me)?|what|which|how many)\b.{0,40}\b(jpe?gs?|pngs?|pdfs?)\b|\b(jpe?gs?|pngs?|pdfs?)\b.{0,40}\b(charts?|chord|files?|attachments?|in this space))\b/i;

export type ChartFileTypeFilter = "jpg" | "png" | "pdf";

/** True when the user wants a song/chart roster (not chords for one song). */
export function wantsSongOrChartList(question: string): boolean {
  const q = question.trim();
  if (/\b(chords? for|what(?:'s| is) the key|key of|lyrics for)\b/i.test(q)) {
    return false;
  }
  return SONG_LIST_QUESTION_PATTERN.test(q);
}

/** JPG / PNG / PDF chart roster questions from practice-stat chips. */
export function chartFileTypeListFilter(
  question: string
): ChartFileTypeFilter | null {
  const q = question.trim().toLowerCase();
  if (!CHART_FILE_TYPE_LIST_PATTERN.test(q) && !/\b(jpe?gs?|pngs?|pdfs?)\b/.test(q)) {
    return null;
  }
  if (!/\b(list|show|give|what|which|how many|charts?|chord|files?|space)\b/i.test(q)) {
    return null;
  }
  if (/\bpdfs?\b/.test(q)) return "pdf";
  if (/\bpngs?\b/.test(q)) return "png";
  if (/\bjpe?gs?\b/.test(q)) return "jpg";
  return null;
}

/** True when the user is asking to list, count, browse, or compare vault files. */
export function wantsVaultFileInventory(question: string): boolean {
  const q = question.trim();
  return (
    INVENTORY_QUESTION_PATTERN.test(q) ||
    wantsSongOrChartList(q) ||
    chartFileTypeListFilter(q) != null
  );
}

/** Prompts for welcome practice-stat chips. */
export function practiceStatsListPrompt(
  kind: "songs" | ChartFileTypeFilter,
  boardName?: string | null
): string {
  const board = boardName?.trim();
  if (kind === "songs") {
    return board
      ? `What songs are on ${board}?`
      : "What songs and chord charts are in this space?";
  }
  if (kind === "jpg") return "List the JPG chord charts in this space";
  if (kind === "png") return "List the PNG chord charts in this space";
  return "List the PDF chord charts in this space";
}

export type AskVaultFileRow = {
  file_name: string;
  mime_type?: string | null;
};

export type AskVaultLogRow = {
  title: string | null;
  log_date: string;
  content: string;
};

export type AskVaultInventory = {
  documentCount: number;
  photoCount: number;
  logCount: number;
  documentNames: string[];
  photoNames: string[];
  logNames: string[];
  documentNamesMore: number;
  photoNamesMore: number;
  logNamesMore: number;
};

function previewNames(names: string[], limit = ASK_VAULT_NAME_PREVIEW) {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  return {
    names: clean.slice(0, limit),
    more: Math.max(0, clean.length - limit),
  };
}

function isPhoto(row: AskVaultFileRow): boolean {
  return (
    isImageMimeType(row.mime_type) || isImageFileName(row.file_name)
  );
}

function logLabel(row: AskVaultLogRow): string {
  if (row.title?.trim()) return row.title.trim();
  const snippet = row.content.trim().replace(/\s+/g, " ").slice(0, 48);
  if (snippet) {
    return snippet.length < row.content.trim().length
      ? `${row.log_date} · ${snippet}…`
      : `${row.log_date} · ${snippet}`;
  }
  return row.log_date;
}

export type VaultFileInventoryRow = {
  file_name: string;
  mime_type?: string | null;
  profile_id: string;
};

export type BoundConnectedFileRow = {
  name: string;
  cardName?: string | null;
  sourceType: string;
  processingStatus: string;
  mimeType?: string | null;
};

/** Ensure opaque Trello ids get a real extension from mime (for JPG/PDF lists). */
export function displayNameWithMimeExtension(
  name: string,
  mimeType?: string | null
): string {
  const trimmed = name.trim() || "file";
  if (/\.[a-z0-9]{2,5}$/i.test(trimmed)) return trimmed;
  const mime = (mimeType ?? "").toLowerCase();
  if (mime === "application/pdf" || mime.includes("pdf")) return `${trimmed}.pdf`;
  if (mime === "image/png") return `${trimmed}.png`;
  if (mime === "image/jpeg" || mime === "image/jpg") return `${trimmed}.jpg`;
  if (mime === "image/webp") return `${trimmed}.webp`;
  if (mime === "image/gif") return `${trimmed}.gif`;
  return trimmed;
}

/**
 * Trello / Device Storage files bound to the active space.
 * Ask Gideon should treat these as files in this space, not only on Connections.
 */
export function formatBoundConnectedFilesForGideon(
  files: BoundConnectedFileRow[],
  spaceNames: string[]
): string {
  if (!files.length) return "";
  const spaceLabel =
    spaceNames.map((n) => n.trim()).filter(Boolean).join(", ") || "this space";
  const lines = [
    `SPACE FILE INVENTORY (Trello / connected files in ${spaceLabel} — treat these as files in this space, not only on the connection):`,
  ];
  for (const file of files) {
    const displayName = displayNameWithMimeExtension(
      file.name,
      file.mimeType
    );
    const card =
      typeof file.cardName === "string" && file.cardName.trim()
        ? ` · ${file.cardName.trim()}`
        : "";
    const kind =
      file.sourceType === "trello"
        ? "Trello"
        : file.sourceType === "google_drive"
          ? "Google Drive"
          : "Device Storage";
    lines.push(
      `- ${displayName}${card} (${kind} in this space, ${file.processingStatus})`
    );
  }
  return lines.join("\n");
}

/** File list for Ask Gideon — answers "what's uploaded" without relying on RAG excerpts. */
export function formatVaultFileListForGideon(
  files: VaultFileInventoryRow[],
  profileNames: Record<string, string>
): string {
  if (files.length === 0) {
    return "(no documents or photos uploaded in the active space scope)";
  }

  const byProfile = new Map<string, VaultFileInventoryRow[]>();
  for (const file of files) {
    const bucket = byProfile.get(file.profile_id) ?? [];
    bucket.push(file);
    byProfile.set(file.profile_id, bucket);
  }

  const blocks: string[] = [];
  for (const [profileId, rows] of byProfile) {
    const spaceName = profileNames[profileId]?.trim() || "Space";
    const photos = rows.filter(isPhoto);
    const documents = rows.filter((row) => !isPhoto(row));
    const lines: string[] = [];
    if (documents.length > 0) {
      lines.push(
        `Documents (${documents.length}): ${documents.map((d) => d.file_name).join(", ")}`
      );
    }
    if (photos.length > 0) {
      lines.push(
        `Photos (${photos.length}): ${photos.map((p) => p.file_name).join(", ")}`
      );
    }
    blocks.push(`${spaceName}:\n${lines.join("\n")}`);
  }

  return blocks.join("\n\n");
}

/** Brief summary for normal questions — recent files and counts only. */
export function formatVaultFileSummaryForGideon(
  files: VaultFileInventoryRow[],
  profileNames: Record<string, string>,
  countsByProfile: Record<string, number>
): string {
  const total = files.length;
  if (total === 0) {
    return "(no documents or photos uploaded in the active space scope)";
  }

  const byProfile = new Map<string, VaultFileInventoryRow[]>();
  for (const file of files) {
    const bucket = byProfile.get(file.profile_id) ?? [];
    bucket.push(file);
    byProfile.set(file.profile_id, bucket);
  }

  const lines: string[] = [
    `(Summary only — ask to list files for the full inventory. ${total} recent file(s) shown.)`,
  ];

  for (const [profileId, rows] of byProfile) {
    const spaceName = profileNames[profileId]?.trim() || "Space";
    const totalInVault = countsByProfile[profileId] ?? rows.length;
    const recent = rows
      .slice(0, RECENT_VAULT_FILE_PREVIEW)
      .map((r) => r.file_name)
      .join(", ");
  const more =
      totalInVault > RECENT_VAULT_FILE_PREVIEW
        ? ` (+${totalInVault - RECENT_VAULT_FILE_PREVIEW} more)`
        : "";
    lines.push(`${spaceName}: ${totalInVault} file(s). Recent: ${recent}${more}`);
  }

  return lines.join("\n");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Topic after "about …" in a scoped inventory question. */
export function extractAboutTopic(question: string): string | null {
  const match = question.match(/\babout\s+(.+?)(?:\?|\.|$)/i);
  const topic = match?.[1]?.trim().replace(/[?.!]+$/, "").trim();
  return topic || null;
}

function topicMentionedInText(text: string, topic: string): boolean {
  const tokens = topic
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  const hay = text.toLowerCase();
  return tokens.some((token) =>
    new RegExp(`\\b${escapeRegex(token)}`, "i").test(hay)
  );
}

function parseInventoryFileNames(inventoryText: string): {
  photos: string[];
  documents: string[];
} {
  if (
    inventoryText.startsWith("(no documents") ||
    inventoryText.startsWith("(Summary only")
  ) {
    const recentMatch = inventoryText.match(
      /Recent:\s*([^.]+?)(?:\s*\(\+\d+ more\))?\.?$/m
    );
    if (!recentMatch) return { photos: [], documents: [] };
    const names = recentMatch[1]!
      .split(/,\s*/)
      .map((n) => n.trim())
      .filter(Boolean);
    return { photos: names, documents: [] };
  }

  const photos: string[] = [];
  const documents: string[] = [];
  for (const line of inventoryText.split(/\n/)) {
    const docMatch = line.match(/^Documents \(\d+\): (.+)$/);
    const photoMatch = line.match(/^Photos \(\d+\): (.+)$/);
    if (docMatch) {
      documents.push(
        ...docMatch[1]!.split(/,\s*/).map((n) => n.trim()).filter(Boolean)
      );
    }
    if (photoMatch) {
      photos.push(
        ...photoMatch[1]!.split(/,\s*/).map((n) => n.trim()).filter(Boolean)
      );
    }
    // Connected Trello/device rows: "- file.jpg · Card Name (Trello in this space, analyzed)"
    const connected = line.match(
      /^-\s+(.+?)(?:\s+·\s+(.+?))?\s+\((?:Trello|Device Storage)\b/i
    );
    if (connected) {
      const label = (connected[2] || connected[1] || "").trim();
      if (label) documents.push(label);
    }
  }
  return { photos, documents };
}

function parseConnectedChartTitles(inventoryText: string): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const entry of parseConnectedChartEntries(inventoryText)) {
    const key = normalizeSongDedupeKey(entry.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    titles.push(entry.title);
  }
  return titles;
}

type ConnectedChartEntry = {
  title: string;
  fileName: string;
  kind: ChartFileTypeFilter | "other";
};

function chartKindFromFileName(fileName: string): ChartFileTypeFilter | "other" {
  if (/\.jpe?g$/i.test(fileName)) return "jpg";
  if (/\.png$/i.test(fileName)) return "png";
  if (/\.pdf$/i.test(fileName)) return "pdf";
  return "other";
}

function parseConnectedChartEntries(inventoryText: string): ConnectedChartEntry[] {
  const entries: ConnectedChartEntry[] = [];
  const seen = new Set<string>();
  for (const line of inventoryText.split(/\n/)) {
    const connected = line.match(
      /^-\s+(.+?)(?:\s+·\s+(.+?))?\s+\((?:Trello|Device Storage)\b/i
    );
    if (!connected) continue;
    const fileName = connected[1]!.trim();
    const cardName = connected[2]?.trim() || "";
    // Board dumps / pasted text are not songs.
    if (/\.txt$/i.test(fileName) || /^pasted\b/i.test(fileName)) continue;
    if (cardName && (/^\.txt$/i.test(cardName) || /^pasted\b/i.test(cardName))) {
      continue;
    }
    const looksLikeChart =
      /\.(jpe?g|png|gif|webp|pdf)$/i.test(fileName) ||
      Boolean(cardName && !/\.txt$/i.test(cardName));
    if (!looksLikeChart) continue;
    if (
      /\.pdf$/i.test(fileName) &&
      !isLikelyChordChartFile(fileName, "application/pdf")
    ) {
      continue;
    }
    if (isNonChordChartNoise(fileName) || isNonChordChartNoise(cardName)) {
      continue;
    }

    const title = songTitleFromInventoryLabel(cardName || fileName);
    if (!looksLikeSongOrChartTitle(title)) continue;
    const kind = chartKindFromFileName(fileName);
    const key = `${normalizeSongDedupeKey(title)}|${kind}|${fileName.toLowerCase()}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    entries.push({ title, fileName, kind });
  }
  return entries;
}

/** Drop Trello admin / session cards that are not chord charts. */
export function looksLikeSongOrChartTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 2) return false;
  if (isNonChordChartNoise(t)) return false;
  if (
    /\b(practice\s+session|rehearsal\s+notes?|set\s*list\s+notes?)\b/i.test(t)
  ) {
    return false;
  }
  if (/\b(bank\s+account|add\s+\w+\s+to\s+bank|todo|to-do|agenda)\b/i.test(t)) {
    return false;
  }
  if (/^[A-Za-z][\w.]*\s*[-–—]\s*Add\b/i.test(t)) return false;
  if (/^(sep|sept|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug)\.?\s+\d/i.test(t) &&
    /\b(session|practice|meeting)\b/i.test(t)
  ) {
    return false;
  }
  return true;
}

export type ConnectedPracticeItemInput = {
  name?: string | null;
  mime_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ConnectedPracticeStats = {
  songCount: number;
  jpgCount: number;
  pngCount: number;
  pdfCount: number;
  chartCount: number;
  analyzedItemCount: number;
  songTitles: string[];
};

/**
 * Count songs and chart file types from analyzed Trello/device items
 * for Ask Gideon welcome stats.
 */
export function summarizeConnectedPracticeItems(
  items: ConnectedPracticeItemInput[]
): ConnectedPracticeStats {
  let jpgCount = 0;
  let pngCount = 0;
  let pdfCount = 0;
  let chartCount = 0;
  const songKeys = new Set<string>();
  const songTitles: string[] = [];

  for (const item of items) {
    const name = String(item.name ?? "").trim();
    const mime = typeof item.mime_type === "string" ? item.mime_type : null;
    const meta =
      item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const kind = String(meta.kind ?? "");
    const cardName =
      typeof meta.cardName === "string" && meta.cardName.trim()
        ? meta.cardName.trim()
        : null;

    // Board text dumps are not chart files.
    if (/\.txt$/i.test(name) || kind === "board" || /^pasted\b/i.test(name)) {
      continue;
    }

    const isJpg =
      /\.jpe?g$/i.test(name) ||
      mime === "image/jpeg" ||
      mime === "image/jpg";
    const isPng = /\.png$/i.test(name) || mime === "image/png";
    const isPdf =
      /\.pdf$/i.test(name) ||
      mime === "application/pdf" ||
      Boolean(mime?.includes("pdf"));
    const isOtherImage =
      !isJpg &&
      !isPng &&
      (isImageFileName(name) || isImageMimeType(mime));

    if (isNonChordChartNoise(name) || (cardName && isNonChordChartNoise(cardName))) {
      continue;
    }
    if (isPdf && !isLikelyChordChartFile(name, mime ?? "application/pdf")) {
      continue;
    }

    if (isJpg || isPng || isPdf || isOtherImage || kind === "attachment") {
      if (isJpg) jpgCount += 1;
      else if (isPng) pngCount += 1;
      else if (isPdf) pdfCount += 1;
      if (isJpg || isPng || isPdf || isOtherImage) chartCount += 1;
    } else {
      continue;
    }

    const title = songTitleFromInventoryLabel(cardName || name);
    if (!looksLikeSongOrChartTitle(title)) continue;
    const key = title.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || songKeys.has(key)) continue;
    songKeys.add(key);
    if (songTitles.length < 8) songTitles.push(title);
  }

  return {
    songCount: songKeys.size,
    jpgCount,
    pngCount,
    pdfCount,
    chartCount,
    analyzedItemCount: items.length,
    songTitles,
  };
}

/** Compact welcome line: "42 songs · 38 JPGs · 4 PDFs". */
export function formatConnectedPracticeStatsLine(
  stats: ConnectedPracticeStats,
  boardName?: string | null
): string | null {
  const bits: string[] = [];
  if (stats.songCount > 0) {
    bits.push(
      `${stats.songCount} song${stats.songCount === 1 ? "" : "s"}`
    );
  }
  if (stats.jpgCount > 0) {
    bits.push(`${stats.jpgCount} JPG${stats.jpgCount === 1 ? "" : "s"}`);
  }
  if (stats.pngCount > 0) {
    bits.push(`${stats.pngCount} PNG${stats.pngCount === 1 ? "" : "s"}`);
  }
  if (stats.pdfCount > 0) {
    bits.push(`${stats.pdfCount} PDF${stats.pdfCount === 1 ? "" : "s"}`);
  }
  if (!bits.length && stats.chartCount > 0) {
    bits.push(
      `${stats.chartCount} chart${stats.chartCount === 1 ? "" : "s"}`
    );
  }
  if (!bits.length) return null;
  const summary = bits.join(" · ");
  const board = boardName?.trim();
  return board ? `${board}: ${summary}` : summary;
}

function songTitleFromInventoryLabel(label: string): string {
  let title = label.replace(/\.(jpe?g|png|gif|webp|pdf)$/i, "").trim();
  title = title
    .replace(/^\d+\.\s*/, "")
    .replace(/\s*-\s*[A-G](?:#|b)?(?:m|maj|min|major|minor|5)?(?:\s|$)/i, " ")
    .replace(/\s*-\s*short version\s*$/i, "")
    .replace(
      /\s*[-–—]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b.*$/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
  return title || label.trim();
}

function normalizeSongDedupeKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNameList(names: string[], cap = 8): string {
  if (names.length <= cap) return names.join(", ");
  return `${names.slice(0, cap - 1).join(", ")}, and ${names.length - (cap - 1)} more`;
}

function countLabel(count: number, kind: string): string {
  return `${count} ${kind}${count === 1 ? "" : "s"}`;
}

/**
 * Rule-based answer for "what do I have in [space] about [topic]?" — avoids blank LLM replies.
 */
export function buildInventoryQuestionAnswer(args: {
  question: string;
  spaceDisplayName: string;
  fileInventoryText: string;
  dailyLogsText?: string;
}): string | null {
  if (!wantsVaultFileInventory(args.question.trim())) return null;

  const space = args.spaceDisplayName.trim() || "this";
  const topic = extractAboutTopic(args.question);
  const logsText = args.dailyLogsText?.trim() ?? "";
  const logsRelevant =
    Boolean(topic) &&
    logsText.length > 0 &&
    logsText !== "(none)" &&
    topicMentionedInText(logsText, topic!);
  const songList = wantsSongOrChartList(args.question);
  const fileTypeFilter = chartFileTypeListFilter(args.question);

  if (args.fileInventoryText.startsWith("(no documents")) {
    if (logsRelevant) {
      return `I found Daily Log notes in your ${space} space that mention ${topic}. Open Daily Logs for the full text, or ask me to quote a specific entry.`;
    }
    return topic
      ? `I don't see any files in your ${space} space yet, so nothing about ${topic}.`
      : `I don't see any files in your ${space} space yet.`;
  }

  const { photos, documents } = parseInventoryFileNames(args.fileInventoryText);
  const allFiles = [...documents, ...photos];

  if (songList) {
    const titles = parseConnectedChartTitles(args.fileInventoryText);
    if (titles.length === 0) {
      return `I don't see chord-chart songs in your ${space} space yet. Scan Living Waters on Connections, then ask again.`;
    }
    const cap = 40;
    const shown = titles.slice(0, cap);
    const more =
      titles.length > cap
        ? ` (+${titles.length - cap} more — ask for the next page)`
        : "";
    return `Songs/charts in your ${space} space (${titles.length}):\n${shown.map((t) => `• ${t}`).join("\n")}${more}`;
  }

  if (fileTypeFilter) {
    const entries = parseConnectedChartEntries(args.fileInventoryText).filter(
      (e) => e.kind === fileTypeFilter
    );
    const label =
      fileTypeFilter === "jpg"
        ? "JPG"
        : fileTypeFilter === "png"
          ? "PNG"
          : "PDF";
    if (entries.length === 0) {
      return `I don't see ${label} chord charts in your ${space} space yet.`;
    }
    const cap = 40;
    const shown = entries.slice(0, cap);
    const more =
      entries.length > cap ? ` (+${entries.length - cap} more)` : "";
    return `${label} charts in your ${space} space (${entries.length}):\n${shown
      .map((e) => `• ${e.title} (${e.fileName})`)
      .join("\n")}${more}`;
  }

  if (topic) {
    const matchingFiles = allFiles.filter((name) =>
      topicMentionedInText(name, topic)
    );
    if (matchingFiles.length > 0) {
      return `In your ${space} space, I found ${countLabel(matchingFiles.length, "file")} about ${topic}: ${formatNameList(matchingFiles)}.`;
    }
    if (logsRelevant) {
      return `I don't see files in your ${space} space with ${topic} in the name, but Daily Logs there mention ${topic}. Ask me to summarize those log entries.`;
    }
    if (allFiles.length === 0) {
      return `I don't see anything in your ${space} space about ${topic}.`;
    }
    const kind =
      photos.length > 0 && documents.length === 0
        ? countLabel(photos.length, "photo")
        : countLabel(allFiles.length, "file");
    const preview =
      allFiles.length <= 6 ? ` (${formatNameList(allFiles, 6)})` : "";
    return `I don't see anything in your ${space} space specifically about ${topic}. That space has ${kind}${preview}, but none appear to mention ${topic} in the file name.`;
  }

  if (allFiles.length === 0) {
    return `I don't see any files in your ${space} space yet.`;
  }

  const parts: string[] = [];
  if (documents.length > 0) {
    parts.push(
      `${countLabel(documents.length, "document")}: ${formatNameList(documents)}`
    );
  }
  if (photos.length > 0) {
    parts.push(`${countLabel(photos.length, "photo")}: ${formatNameList(photos)}`);
  }
  return `In your ${space} space: ${parts.join("; ")}.`;
}

/** Split vault files into documents vs photos and preview names for Ask welcome. */
export function buildAskVaultInventory(
  files: AskVaultFileRow[],
  logs: AskVaultLogRow[]
): AskVaultInventory {
  const photos = files.filter(isPhoto);
  const documents = files.filter((f) => !isPhoto(f));
  const docPreview = previewNames(documents.map((d) => d.file_name));
  const photoPreview = previewNames(photos.map((p) => p.file_name));
  const logPreview = previewNames(logs.map(logLabel));

  return {
    documentCount: documents.length,
    photoCount: photos.length,
    logCount: logs.length,
    documentNames: docPreview.names,
    photoNames: photoPreview.names,
    logNames: logPreview.names,
    documentNamesMore: docPreview.more,
    photoNamesMore: photoPreview.more,
    logNamesMore: logPreview.more,
  };
}
