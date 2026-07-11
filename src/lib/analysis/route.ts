import type { Classification, DocumentType } from "./types";

/** Choose analyzer: low confidence or unimplemented specialist → general. */
export function resolveAnalyzerType(
  classification: Classification,
  implemented: DocumentType[]
): DocumentType {
  if (classification.classification_confidence < 0.8) return "general";
  if (!implemented.includes(classification.document_type)) return "general";
  return classification.document_type;
}
