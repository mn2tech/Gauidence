/**
 * Filename-based classification hints (pure; safe for unit tests).
 * Skips a separate classify LLM call when the name strongly signals document type.
 */

import type { Classification } from "./types";

const CONTRACT_NAME =
  /\b(contract|agreement|ctr[-_]|mou|statement[\s_-]?of[\s_-]?work|sow)\b/i;

export function classificationFromFileName(
  fileName: string | null | undefined
): Classification | null {
  const name = fileName?.trim();
  if (!name) return null;
  if (!CONTRACT_NAME.test(name)) return null;
  return {
    document_type: "contract",
    document_subtype: "contract",
    classification_confidence: 0.92,
    classification_reason: "Inferred from the file name.",
  };
}
