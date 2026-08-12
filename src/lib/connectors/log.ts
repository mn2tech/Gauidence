type ConnectorLogEvent =
  | "connector_started"
  | "folder_selected"
  | "permission_persisted"
  | "permission_failure"
  | "scan_started"
  | "files_discovered"
  | "upsert_result"
  | "scan_completed"
  | "disconnect"
  | "error";

const isDev =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

/** Development-oriented connector logging. Never logs file contents. */
export function connectorLog(
  event: ConnectorLogEvent,
  details?: Record<string, unknown>
): void {
  if (!isDev && event !== "error" && event !== "permission_failure") {
    return;
  }
  const safe = details ? sanitize(details) : undefined;
  // eslint-disable-next-line no-console
  console.info(`[connectors] ${event}`, safe ?? "");
}

function sanitize(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === "filename" || key === "name" || key === "names") {
      // Avoid logging full sensitive filenames in non-dev; truncate in dev.
      if (typeof value === "string") {
        out[key] = isDev ? truncate(value, 48) : "[redacted]";
      } else if (Array.isArray(value)) {
        out[key] = isDev
          ? value.slice(0, 5).map((v) => truncate(String(v), 32))
          : `[${value.length} redacted]`;
      } else {
        out[key] = "[redacted]";
      }
      continue;
    }
    out[key] = value;
  }
  return out;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
