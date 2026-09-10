/**
 * Filename-based classification hints (pure; safe for unit tests).
 * Skips a separate classify LLM call when the name strongly signals document type.
 */

import type { Classification } from "./types";

const CONTRACT_NAME =
  /\b(contract|agreement|ctr[-_]|mou|statement[\s_-]?of[\s_-]?work|sow)\b/i;
const NEWSLETTER_NAME =
  /\b(newsletter|classroom[\s_-]?news|homework[\s_-]?sheet|word[\s_-]?list)\b/i;
const JSON_OR_TRELLO_NAME = /\.json$/i;
const CSV_EXPORT_NAME = /\.csv$/i;

export function classificationFromFileName(
  fileName: string | null | undefined
): Classification | null {
  const name = fileName?.trim();
  if (!name) return null;
  if (NEWSLETTER_NAME.test(name)) {
    return {
      document_type: "school_newsletter",
      document_subtype: "classroom_newsletter",
      classification_confidence: 0.9,
      classification_reason: "School newsletter inferred from the file name.",
    };
  }
  if (JSON_OR_TRELLO_NAME.test(name) || /trello/i.test(name)) {
    return {
      document_type: "general",
      document_subtype: "json_export",
      classification_confidence: 0.95,
      classification_reason: "JSON / Trello export inferred from the file name.",
    };
  }
  if (CSV_EXPORT_NAME.test(name)) {
    return {
      document_type: "general",
      document_subtype: "csv_export",
      classification_confidence: 0.95,
      classification_reason: "CSV export inferred from the file name.",
    };
  }
  if (!CONTRACT_NAME.test(name)) return null;
  return {
    document_type: "contract",
    document_subtype: "contract",
    classification_confidence: 0.92,
    classification_reason: "Inferred from the file name.",
  };
}
