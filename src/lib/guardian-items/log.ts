/** Safe structured logging for Guardian items (never log raw document text). */

export type GuardianLogEvent =
  | "guardian_extraction_started"
  | "guardian_extraction_completed"
  | "guardian_item_created"
  | "guardian_item_deduped"
  | "guardian_item_low_confidence"
  | "guardian_item_completed"
  | "guardian_item_dismissed"
  | "guardian_item_snoozed"
  | "guardian_watch_generated";

export function logGuardianEvent(
  event: GuardianLogEvent,
  fields: Record<string, string | number | boolean | null | undefined>
): void {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    // Never accept large free-text payloads under generic keys.
    if (
      typeof value === "string" &&
      (key.includes("excerpt") ||
        key.includes("text") ||
        key.includes("content") ||
        key.includes("body"))
    ) {
      safe[key] = `[redacted len=${value.length}]`;
      continue;
    }
    safe[key] = value;
  }
  console.info(JSON.stringify({ event, ...safe }));
}
