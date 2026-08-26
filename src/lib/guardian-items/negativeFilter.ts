import type { GuardianExtractedItem } from "./schema";

/**
 * Deterministic guard against low-value historical / evergreen facts
 * that should never become Watch items even if the model emits them.
 */
export function isLowValueHistoricalFact(item: GuardianExtractedItem): boolean {
  const text = [
    item.title,
    item.description ?? "",
    item.source_excerpt,
  ]
    .join(" ")
    .toLowerCase();

  if (/\bfounded in\s+\d{4}\b/.test(text)) return true;
  if (/\b(established|incorporated)\s+in\s+\d{4}\b/.test(text)) return true;
  if (
    /\b(document|report|file)\s+(was\s+)?(generated|printed|created)\b/.test(
      text
    )
  ) {
    return true;
  }
  if (
    /\b(classes?|students?)\s+(are\s+)?(typically\s+)?(held\s+|attend\s+)?(monday|mon).*friday\b/.test(
      text
    ) &&
    !item.event_date &&
    !item.due_at
  ) {
    return true;
  }
  if (/\b(contact us|call us|click here)\b.*\btoday\b/.test(text)) return true;
  if (/\bclick here to contact\b/.test(text)) return true;

  return false;
}
