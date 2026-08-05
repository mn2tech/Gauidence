import type { ImportedConversation, ImportedMessage } from "./types";
import { IMPORT_MAX_MESSAGES_PER_CONVERSATION, IMPORT_MAX_MESSAGE_CHARS } from "./types";

type ClaudeContentBlock = {
  type?: string;
  text?: string;
};

type ClaudeMessage = {
  uuid?: string;
  text?: string;
  content?: ClaudeContentBlock[];
  sender?: string;
  created_at?: string;
};

type ClaudeConversation = {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages?: ClaudeMessage[];
};

function extractClaudeText(msg: ClaudeMessage): string {
  if (typeof msg.text === "string" && msg.text.trim()) {
    return msg.text;
  }
  if (!Array.isArray(msg.content)) return "";
  return msg.content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function clampMessage(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= IMPORT_MAX_MESSAGE_CHARS) return trimmed;
  return `${trimmed.slice(0, IMPORT_MAX_MESSAGE_CHARS - 1)}…`;
}

function parseClaudeRole(sender: string | undefined): "user" | "assistant" | null {
  if (sender === "human") return "user";
  if (sender === "assistant") return "assistant";
  return null;
}

function toIso(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function parseClaudeConversation(
  raw: ClaudeConversation
): ImportedConversation | null {
  const externalId =
    typeof raw.uuid === "string" && raw.uuid.trim() ? raw.uuid.trim() : null;
  if (!externalId) return null;

  const createdAt = toIso(raw.created_at, new Date().toISOString());
  const updatedAt = toIso(raw.updated_at, createdAt);
  const title =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : "Imported chat";

  const messages: ImportedMessage[] = [];
  for (const msg of raw.chat_messages ?? []) {
    const role = parseClaudeRole(msg.sender);
    if (!role) continue;
    const content = clampMessage(extractClaudeText(msg));
    if (!content) continue;
    messages.push({
      role,
      content,
      createdAt: toIso(msg.created_at, createdAt),
    });
    if (messages.length >= IMPORT_MAX_MESSAGES_PER_CONVERSATION) break;
  }

  if (messages.length === 0) return null;

  return {
    externalId,
    title,
    source: "claude",
    createdAt,
    updatedAt,
    messages,
  };
}

export function parseClaudeExport(data: unknown): ImportedConversation[] {
  if (!Array.isArray(data)) return [];
  const out: ImportedConversation[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const parsed = parseClaudeConversation(item as ClaudeConversation);
    if (parsed) out.push(parsed);
  }
  return out;
}
