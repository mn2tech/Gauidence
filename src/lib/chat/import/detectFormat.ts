import type { ChatImportSource } from "./types";

export function detectExportFormat(
  data: unknown
): ChatImportSource | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!first || typeof first !== "object") return null;
  const record = first as Record<string, unknown>;
  if (Array.isArray(record.chat_messages)) return "claude";
  if (record.mapping && typeof record.mapping === "object") return "chatgpt";
  return null;
}
