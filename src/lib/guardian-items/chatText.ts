const DATE_SIGNAL =
  /\b(?:today|tomorrow|tonight|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s*,)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)?\s*\d{0,2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;

const ATTENTION_SIGNAL =
  /\b(?:due|deadline|meeting|appointment|interview|event|submit|send|reply|respond|confirm|pay|payment|renew|expires?|register|registration|rsvp|attend|permission|form|follow[ -]?up|scheduled|starts?|ends?|closed|no school|remind(?:er)?)\b/i;

const EMAIL_SIGNAL =
  /(?:^|\n)\s*(?:from|to|cc|subject|sent|date):|\b(?:hi|hello|dear)\s+[A-Z]|\bthanks?(?:,|\s*$)|\bbest regards\b/im;

/**
 * Only auto-extract a chat message when it resembles pasted source material.
 * This prevents ordinary date questions from silently becoming reminders.
 */
export function shouldExtractGuardianItemsFromChatText(text: string): boolean {
  const value = text.trim();
  if (value.length < 30 || value.length > 20_000) return false;
  if (!DATE_SIGNAL.test(value) || !ATTENTION_SIGNAL.test(value)) return false;
  if (value.length < 180 && value.endsWith("?")) return false;
  return EMAIL_SIGNAL.test(value) || value.length >= 100;
}

