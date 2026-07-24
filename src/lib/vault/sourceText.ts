/**
 * Source text helpers (pure — safe for unit tests).
 */

/** Max chars stored/indexed from extraction (large PDFs are truncated). */
export const SOURCE_TEXT_MAX_CHARS = 250_000;

/** Trim and cap extracted text before DB storage / embedding. */
export function capSourceText(text: string | null | undefined): string | null {
  const trimmed = text?.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;
  if (trimmed.length <= SOURCE_TEXT_MAX_CHARS) return trimmed;
  return trimmed.slice(0, SOURCE_TEXT_MAX_CHARS);
}
