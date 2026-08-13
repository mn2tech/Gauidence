/** Detect JSON documents by MIME or filename. */
export function isJsonMimeOrName(
  mimeType?: string | null,
  fileName?: string | null
): boolean {
  const mime = (mimeType ?? "").toLowerCase().trim();
  if (mime === "application/json" || mime === "text/json") return true;
  return /\.json$/i.test(fileName ?? "");
}

/**
 * Decode JSON to pretty-printed text for analysis.
 * Invalid JSON is returned as trimmed UTF-8 so analysis can still proceed.
 */
export function normalizeJsonText(raw: string): string {
  const trimmed = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";
  try {
    return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2);
  } catch {
    return trimmed;
  }
}
