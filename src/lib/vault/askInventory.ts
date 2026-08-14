import { isImageFileName, isImageMimeType } from "@/lib/vault/images";

export const ASK_VAULT_NAME_PREVIEW = 6;
export const RECENT_VAULT_FILE_PREVIEW = 5;

const INVENTORY_QUESTION_PATTERN =
  /\b(what(?:'s| is| are)?\s+(?:do\s+)?(?:i|we)\s+have\b|what(?:'s| is| are)?\s+(?:in\s+)?(?:the\s+)?(?:vault|space|workspace|uploaded|stored|files?|documents?|photos?)|list\s+(?:all\s+)?(?:files?|documents?|uploads?|photos?)|how\s+many\s+(?:files?|documents?|photos?|uploads?)|show\s+(?:me\s+)?(?:all\s+)?(?:files?|documents?|uploads?)|(?:count|browse|compare)\s+(?:files?|documents?|uploads?)|everything\s+(?:in|uploaded)|file\s+inventory)\b/i;

/** True when the user is asking to list, count, browse, or compare vault files. */
export function wantsVaultFileInventory(question: string): boolean {
  return INVENTORY_QUESTION_PATTERN.test(question.trim());
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
};

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
    const card =
      typeof file.cardName === "string" && file.cardName.trim()
        ? ` · ${file.cardName.trim()}`
        : "";
    const kind = file.sourceType === "trello" ? "Trello" : "Device Storage";
    lines.push(
      `- ${file.name}${card} (${kind} in this space, ${file.processingStatus})`
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
  }
  return { photos, documents };
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
