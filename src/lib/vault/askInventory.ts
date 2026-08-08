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
