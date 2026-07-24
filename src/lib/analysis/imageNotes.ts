/**
 * Enrich analysis for photographed notes and handwritten lists (pure; unit-testable).
 */

import type { GuardianAnalysis } from "./types";
import { normalizeFact } from "./normalize";

/** True when OCR text looks like a multi-line list or note. */
export function looksLikeListTranscription(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-*\d.)\]]+/, "").trim())
    .filter((l) => l.length >= 2);
  return lines.length >= 2 && lines.length <= 80;
}

export function listLinesFromTranscription(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-*\d.)\]]+/, "").trim())
    .filter((l) => l.length >= 1);
}

/**
 * When a photo was OCR'd into lines, surface each line as a searchable fact.
 */
export function enrichAnalysisFromImageTranscription(
  analysis: GuardianAnalysis,
  transcription: string
): GuardianAnalysis {
  const lines = listLinesFromTranscription(transcription);
  if (lines.length < 2) return analysis;

  const next = { ...analysis };
  if (!next.title?.trim() || next.title === "Untitled document") {
    next.title = "Photo note";
  }
  if (!next.summary?.trim() || next.summary.length < 24) {
    next.summary = `Photographed note with ${lines.length} items transcribed from the image.`;
  }

  const existing = new Set(
    (next.facts ?? []).map((f) => String(f.value ?? "").trim().toLowerCase())
  );
  const listFacts = lines
    .filter((line) => !existing.has(line.toLowerCase()))
    .map((line, i) =>
      normalizeFact({
        label: `Item ${i + 1}`,
        value: line,
        source_type: "document",
        source_excerpt: line,
        confidence: 0.85,
        needs_verification: false,
      })
    )
    .filter((f): f is NonNullable<typeof f> => Boolean(f));

  next.facts = [...listFacts, ...(next.facts ?? [])].slice(0, 40);
  return next;
}
