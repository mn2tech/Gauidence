/** Safe structured logging for Semantic Layer (never log raw document contents). */

export type SemanticLogEvent =
  | "semantic_extraction_started"
  | "semantic_extraction_completed"
  | "semantic_entity_resolved"
  | "semantic_ingestion_completed"
  | "semantic_watch_rule_fired"
  | "semantic_extraction_failed"
  | "semantic_backfill_queued";

export function logSemanticEvent(
  event: SemanticLogEvent,
  fields: Record<string, string | number | boolean | null | undefined>
): void {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (
      typeof value === "string" &&
      (key.includes("excerpt") ||
        key.includes("text") ||
        key.includes("content") ||
        key.includes("body") ||
        key.includes("prompt"))
    ) {
      safe[key] = `[redacted len=${value.length}]`;
      continue;
    }
    safe[key] = value;
  }
  console.info(JSON.stringify({ event, ...safe }));
}
