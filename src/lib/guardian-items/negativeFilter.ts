import type { GuardianExtractedItem } from "./schema";

const ACTION_HINT_RE =
  /\b(respond|reply|submit|sign|pay|renew|confirm|schedule|call|email|send|complete|return|approve|permission|rsvp|register|attend|pick|remind|follow.?up|due|deadline)\b/i;

/**
 * Contact details, program blurbs, and model meta-reasoning that should not
 * become their own Watch cards.
 */
export function isNonActionableFragment(item: GuardianExtractedItem): boolean {
  const title = item.title.trim();
  const titleLower = title.toLowerCase();

  // Bare email / contact as the whole title.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(title)) return true;
  if (/^(email|phone|contact|address)\s*:/i.test(title) && !ACTION_HINT_RE.test(title)) {
    return true;
  }

  // LLM meta-reasoning dumped as a task (e.g. screenshot date inference).
  if (/\bscreenshot timestamp\b/i.test(title)) return true;
  if (
    title.length > 100 &&
    /\b(suggesting|indicates|inferred from|not explicitly stated)\b/i.test(title)
  ) {
    return true;
  }

  // Descriptive program/service blurbs without a user action.
  const looksDescriptive =
    /^(provides?|offers?|supports?|helps?|enables?|resource teachers?|the program)\b/i.test(
      title
    ) ||
    (title.length > 100 &&
      !ACTION_HINT_RE.test(title) &&
      !item.requires_action &&
      !item.event_date &&
      !item.due_at);

  if (looksDescriptive && !ACTION_HINT_RE.test(title)) return true;

  // Title that is only a restatement of background copy.
  if (
    item.type === "informational" &&
    !item.requires_action &&
    !item.event_date &&
    !item.due_at &&
    titleLower.length > 80 &&
    !ACTION_HINT_RE.test(title)
  ) {
    return true;
  }

  return false;
}

/**
 * Deterministic guard against low-value historical / evergreen facts
 * that should never become Watch items even if the model emits them.
 */
export function isLowValueHistoricalFact(item: GuardianExtractedItem): boolean {
  if (isNonActionableFragment(item)) return true;

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
