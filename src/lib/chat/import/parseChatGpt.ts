import type { ImportedConversation, ImportedMessage } from "./types";
import { IMPORT_MAX_MESSAGES_PER_CONVERSATION, IMPORT_MAX_MESSAGE_CHARS } from "./types";

type ChatGptContent = {
  content_type?: string;
  parts?: unknown[];
};

type ChatGptMessage = {
  author?: { role?: string };
  create_time?: number;
  content?: ChatGptContent;
};

type ChatGptNode = {
  id?: string;
  message?: ChatGptMessage | null;
  parent?: string | null;
  children?: string[];
};

type ChatGptConversation = {
  id?: string;
  conversation_id?: string;
  title?: string;
  create_time?: number;
  update_time?: number;
  current_node?: string;
  mapping?: Record<string, ChatGptNode>;
};

function extractChatGptContent(content: ChatGptContent | undefined): string {
  if (!content || !Array.isArray(content.parts)) return "";
  return content.parts
    .map((part) => {
      if (typeof part === "string") return part;
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

function unixToIso(value: number | undefined, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return new Date(value * 1000).toISOString();
}

function flattenActiveBranch(
  conv: ChatGptConversation,
  fallbackCreatedAt: string
): ImportedMessage[] {
  const mapping = conv.mapping ?? {};
  let nodeId = conv.current_node;
  if (!nodeId || !mapping[nodeId]) {
    const leaf = Object.values(mapping).find(
      (node) => node?.children?.length === 0 && node.message
    );
    nodeId = leaf?.id;
  }
  if (!nodeId) return [];

  const chain: string[] = [];
  const seen = new Set<string>();
  while (nodeId && !seen.has(nodeId)) {
    seen.add(nodeId);
    chain.push(nodeId);
    const node = mapping[nodeId];
    if (!node?.parent) break;
    nodeId = node.parent;
  }
  chain.reverse();

  const messages: ImportedMessage[] = [];
  for (const id of chain) {
    const node = mapping[id];
    const message = node?.message;
    if (!message) continue;
    const role = message.author?.role;
    if (role !== "user" && role !== "assistant") continue;
    const content = clampMessage(extractChatGptContent(message.content));
    if (!content) continue;
    messages.push({
      role,
      content,
      createdAt: unixToIso(message.create_time, fallbackCreatedAt),
    });
    if (messages.length >= IMPORT_MAX_MESSAGES_PER_CONVERSATION) break;
  }
  return messages;
}

export function parseChatGptConversation(
  raw: ChatGptConversation
): ImportedConversation | null {
  const externalId =
    (typeof raw.conversation_id === "string" && raw.conversation_id.trim()) ||
    (typeof raw.id === "string" && raw.id.trim()) ||
    null;
  if (!externalId) return null;

  const createdAt = unixToIso(raw.create_time, new Date().toISOString());
  const updatedAt = unixToIso(raw.update_time, createdAt);
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : "Imported chat";

  const messages = flattenActiveBranch(raw, createdAt);
  if (messages.length === 0) return null;

  return {
    externalId,
    title,
    source: "chatgpt",
    createdAt,
    updatedAt,
    messages,
  };
}

export function parseChatGptExport(data: unknown): ImportedConversation[] {
  if (!Array.isArray(data)) return [];
  const out: ImportedConversation[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const parsed = parseChatGptConversation(item as ChatGptConversation);
    if (parsed) out.push(parsed);
  }
  return out;
}
