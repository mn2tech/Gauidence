import type { OntologyExtractionResult } from "../types";

/**
 * Minimal ontology when the model returns nothing usable (e.g. image-heavy
 * charts). Persist still creates a document node from the file name; this
 * keeps Analyze from hard-failing and surfaces an obvious subject when present.
 */
export function fallbackOntologyFromFileName(
  fileName: string
): OntologyExtractionResult | null {
  const base = stripExtension(fileName)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (base.length < 2) return null;
  if (isGenericFileLabel(base)) return null;

  const entities: OntologyExtractionResult["entities"] = [
    {
      type: "document",
      name: base,
      confidence: 0.55,
      description: `Connected reference file "${fileName}".`,
    },
  ];

  const subject = inferSubjectFromTitle(base);
  if (subject && subject.toLowerCase() !== base.toLowerCase()) {
    entities.push({
      type: "asset",
      name: subject,
      confidence: 0.5,
      description: `Subject inferred from file name "${fileName}".`,
    });
  }

  return { entities, relationships: [], events: [] };
}

function stripExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return trimmed;
  return trimmed.slice(0, dot);
}

function isGenericFileLabel(name: string): boolean {
  return /^(document|scan|image|photo|file|untitled|download|img|dsc|screenshot)([_\s-]?\d+)?$/i.test(
    name
  );
}

/** Pull a subject like "Bass Guitar" from titles such as "Bass Guitar Bass Chart". */
function inferSubjectFromTitle(title: string): string | null {
  const stripped = title
    .replace(
      /\b(bass\s+)?(chart|chord\s*chart|sheet\s*music|sheet|score|tabs?|tablature|reference|guide|manual|lesson|handout|worksheet)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length < 3) return null;
  if (isGenericFileLabel(stripped)) return null;
  return stripped;
}
