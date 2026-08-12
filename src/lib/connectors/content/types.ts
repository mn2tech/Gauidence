/**
 * Temporary source content for analysis.
 * Never persist these bytes to Guardian Storage.
 */

export interface SourceContent {
  mimeType: string;
  filename: string;
  /** UTF-8 text when already available (plain text / csv). */
  text?: string;
  /** Raw bytes for server-side extraction (request-scoped only). */
  bytes?: Uint8Array;
  metadata?: Record<string, unknown>;
}

export interface SourceContentReader {
  read(item: {
    id?: string;
    sourceId: string;
    name: string;
    mimeType?: string;
    sourceUri: string;
    metadata?: Record<string, unknown>;
  }): Promise<SourceContent>;
}

export const ANALYZE_SUPPORTED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/excel",
]);

export function isAnalyzeSupportedMime(
  mimeType?: string | null,
  filename?: string
): boolean {
  const mime = (mimeType ?? "").toLowerCase().trim();
  if (mime && ANALYZE_SUPPORTED_MIME.has(mime)) return true;
  const name = (filename ?? "").toLowerCase();
  return /\.(pdf|txt|md|csv|jpe?g|png|webp|heic|gif|xlsx|xls)$/i.test(name);
}

export function guessMimeFromName(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}
