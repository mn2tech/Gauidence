import { isImageFileName, isImageMimeType } from "@/lib/vault/images";

export const ASK_VAULT_NAME_PREVIEW = 6;

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
