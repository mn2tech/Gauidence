/**
 * Pure text chunking for vault RAG (safe for unit tests).
 */

export const CHUNK_SIZE = 900;
export const CHUNK_OVERLAP = 120;

export type VaultIndexSource = {
  fileName: string;
  title?: string | null;
  summary?: string | null;
  documentType?: string | null;
  facts?: { label?: string; value?: string; source?: string }[] | null;
  warnings?: string[] | null;
  specialist?: Record<string, unknown> | null;
};

/**
 * Flatten analysis into searchable plain text for embedding.
 */
export function buildVaultIndexText(source: VaultIndexSource): string {
  const lines: string[] = [`Document: ${source.fileName}`];
  if (source.title?.trim()) lines.push(`Title: ${source.title.trim()}`);
  if (source.documentType) lines.push(`Type: ${source.documentType}`);
  if (source.summary?.trim()) {
    lines.push("", "Summary:", source.summary.trim());
  }
  const facts = Array.isArray(source.facts) ? source.facts : [];
  if (facts.length) {
    lines.push("", "Facts:");
    for (const f of facts) {
      const label = String(f.label ?? "Fact").trim();
      const value = String(f.value ?? "").trim();
      if (!value) continue;
      lines.push(`- ${label}: ${value}`);
    }
  }
  const warnings = Array.isArray(source.warnings)
    ? source.warnings.map(String).filter((w) => w.trim())
    : [];
  if (warnings.length) {
    lines.push("", "Warnings:");
    for (const w of warnings) lines.push(`- ${w}`);
  }
  if (source.specialist && typeof source.specialist === "object") {
    const clone = { ...source.specialist };
    delete clone.__raw_model;
    const json = JSON.stringify(clone);
    if (json && json !== "{}") {
      lines.push("", "Specialist fields:", json);
    }
  }
  return lines.join("\n").trim();
}

/**
 * Split text into overlapping chunks for embedding.
 */
export function chunkText(
  text: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= size) return [cleaned];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + size, cleaned.length);
    if (end < cleaned.length) {
      const slice = cleaned.slice(start, end);
      const breakAt = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf(" ")
      );
      if (breakAt > size * 0.4) {
        end = start + breakAt + 1;
      }
    }
    const piece = cleaned.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= cleaned.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

export function prepareVaultChunks(source: VaultIndexSource): string[] {
  const text = buildVaultIndexText(source);
  // Filename-only stubs are not worth indexing.
  const hasBody =
    Boolean(source.summary?.trim()) ||
    (Array.isArray(source.facts) &&
      source.facts.some((f) => String(f.value ?? "").trim())) ||
    Boolean(source.title?.trim());
  if (!hasBody) return [];
  return chunkText(text);
}
