import type { OntologyExtractionResult } from "../types";

const TRANSCRIPT_ATTR = "content_transcript";
const TRANSCRIPT_MAX = 3500;

/**
 * Attach a vision transcript to the document entity so Gideon can answer
 * about chart/sheet contents (chords, labels), not just the file name.
 */
export function enrichOntologyWithTranscript(
  extraction: OntologyExtractionResult,
  transcript: string,
  fileName: string
): OntologyExtractionResult {
  const summary = transcript.trim().slice(0, TRANSCRIPT_MAX);
  if (summary.length < 12) return extraction;

  const entities = extraction.entities.map((e) => ({ ...e }));
  const docIdx = entities.findIndex((e) => e.type === "document");
  const baseName = fileName.replace(/\.[^.]+$/, "").trim() || fileName;
  const contentDesc = `Chart / reference content:\n${summary}`;

  if (docIdx >= 0) {
    const existing = entities[docIdx]!;
    const prior = (existing.description ?? "").trim();
    entities[docIdx] = {
      ...existing,
      description: [prior, contentDesc]
        .filter((p) => p.length > 0)
        .join("\n\n")
        .slice(0, TRANSCRIPT_MAX + 200),
      attributes: {
        ...(existing.attributes ?? {}),
        [TRANSCRIPT_ATTR]: summary,
      },
      confidence: Math.max(existing.confidence, 0.75),
    };
  } else {
    entities.unshift({
      type: "document",
      name: baseName,
      confidence: 0.8,
      description: contentDesc,
      attributes: { [TRANSCRIPT_ATTR]: summary },
    });
  }

  return { ...extraction, entities };
}

export function readContentTranscript(
  properties: Record<string, unknown> | null | undefined
): string | null {
  if (!properties || typeof properties !== "object") return null;
  const raw = properties[TRANSCRIPT_ATTR];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
