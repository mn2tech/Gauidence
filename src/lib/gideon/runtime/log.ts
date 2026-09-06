/** Structured logging for Gideon conversation runtime. */

export type RuntimeLogEvent =
  | "gideon_runtime_turn_started"
  | "gideon_runtime_turn_completed"
  | "gideon_runtime_resolution"
  | "gideon_runtime_state_update"
  | "gideon_runtime_fallback"
  | "gideon_runtime_access_denied";

export function logRuntimeEvent(
  event: RuntimeLogEvent,
  fields: Record<string, string | number | boolean | null | undefined>
): void {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (
      typeof value === "string" &&
      (key.includes("excerpt") ||
        key.includes("content") ||
        key.includes("body") ||
        key.includes("document") ||
        key.includes("prompt") ||
        key === "answer" ||
        key === "message")
    ) {
      safe[key] = `[redacted len=${value.length}]`;
      continue;
    }
    safe[key] = value;
  }
  console.info(JSON.stringify({ event, ...safe }));
}
