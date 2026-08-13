import type { FileTypeCategory } from "./types";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "gif", "bmp"]);
const PDF_EXT = new Set(["pdf"]);
const DOC_EXT = new Set(["doc", "docx", "rtf", "odt"]);
const SHEET_EXT = new Set(["xls", "xlsx", "csv", "ods"]);
const TEXT_EXT = new Set(["txt", "md", "markdown", "log", "json"]);

export function extensionOf(filename: string): string {
  const base = filename.trim().split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** UI-only file type classification (no AI). */
export function classifyFileType(
  filename: string,
  mimeType?: string | null
): FileTypeCategory {
  const ext = extensionOf(filename);
  if (IMAGE_EXT.has(ext) || (mimeType?.startsWith("image/") ?? false)) {
    return "Images";
  }
  if (PDF_EXT.has(ext) || mimeType === "application/pdf") {
    return "PDF";
  }
  if (DOC_EXT.has(ext) || mimeType?.includes("word") || mimeType?.includes("msword")) {
    return "Documents";
  }
  if (
    SHEET_EXT.has(ext) ||
    mimeType?.includes("spreadsheet") ||
    mimeType === "text/csv"
  ) {
    return "Spreadsheets";
  }
  if (
    TEXT_EXT.has(ext) ||
    mimeType?.startsWith("text/") ||
    mimeType === "application/json"
  ) {
    return "Text";
  }
  return "Other";
}

export function countByCategory(
  items: Array<{ name: string; mimeType?: string | null }>
): Record<FileTypeCategory, number> {
  const counts: Record<FileTypeCategory, number> = {
    Images: 0,
    PDF: 0,
    Documents: 0,
    Spreadsheets: 0,
    Text: 0,
    Other: 0,
  };
  for (const item of items) {
    counts[classifyFileType(item.name, item.mimeType)] += 1;
  }
  return counts;
}
