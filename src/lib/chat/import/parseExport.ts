import { detectExportFormat } from "./detectFormat";
import { parseChatGptExport } from "./parseChatGpt";
import { parseClaudeExport } from "./parseClaude";
import type {
  ChatImportSource,
  ImportedConversation,
  ImportedConversationPreview,
} from "./types";

export function parseExport(data: unknown): {
  source: ChatImportSource;
  conversations: ImportedConversation[];
} {
  const source = detectExportFormat(data);
  if (!source) {
    throw new Error(
      "Unrecognized export format. Upload conversations.json from ChatGPT or Claude."
    );
  }

  const conversations =
    source === "claude" ? parseClaudeExport(data) : parseChatGptExport(data);

  if (conversations.length === 0) {
    throw new Error("No conversations with messages were found in this export.");
  }

  return { source, conversations };
}

export function toConversationPreviews(
  conversations: ImportedConversation[]
): ImportedConversationPreview[] {
  return conversations.map((c) => ({
    externalId: c.externalId,
    title: c.title,
    source: c.source,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
  }));
}

export type { ChatImportSource, ImportedConversation, ImportedConversationPreview };
export { detectExportFormat } from "./detectFormat";
export {
  parseChatGptConversation,
  parseChatGptExport,
} from "./parseChatGpt";
export { parseClaudeConversation, parseClaudeExport } from "./parseClaude";
export * from "./types";
