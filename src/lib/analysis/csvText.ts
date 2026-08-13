import {
  ANALYSIS_PROMPT_MAX_CHARS,
  SOURCE_TEXT_MAX_CHARS,
} from "@/lib/vault/sourceText";

/** Detect CSV documents by MIME or filename. */
export function isCsvMimeOrName(
  mimeType?: string | null,
  fileName?: string | null
): boolean {
  const mime = (mimeType ?? "").toLowerCase().trim();
  if (mime === "text/csv" || mime === "application/csv") return true;
  return /\.csv$/i.test(fileName ?? "");
}

/**
 * Normalize CSV into analysis-friendly text.
 * Caps size so large board/card exports finish instead of stalling the worker.
 */
export function normalizeCsvText(
  raw: string,
  maxChars: number = SOURCE_TEXT_MAX_CHARS
): string {
  const trimmed = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n…[truncated ${trimmed.length - maxChars} chars]`;
}

/** Cap used when preparing CSV for the Claude prompt in executeAnalysis. */
export const CSV_ANALYSIS_MAX_CHARS = ANALYSIS_PROMPT_MAX_CHARS * 4;
