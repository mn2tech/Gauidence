/**
 * Source text helpers (pure — safe for unit tests).
 */

/** Max chars stored/indexed from extraction (large PDFs are truncated). */
export const SOURCE_TEXT_MAX_CHARS = 250_000;

/** Max chars sent to Claude in text-mode analysis (unbounded dumps time out). */
export const ANALYSIS_PROMPT_MAX_CHARS = 24_000;

/** Trim and cap extracted text before DB storage / embedding. */
export function capSourceText(text: string | null | undefined): string | null {
  const trimmed = text?.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;
  if (trimmed.length <= SOURCE_TEXT_MAX_CHARS) return trimmed;
  return trimmed.slice(0, SOURCE_TEXT_MAX_CHARS);
}

export function clipTextForPrompt(
  text: string,
  maxChars: number = ANALYSIS_PROMPT_MAX_CHARS
): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]`;
}
