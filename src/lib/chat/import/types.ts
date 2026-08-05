export type ChatImportSource = "chatgpt" | "claude";

export type ImportedMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ImportedConversation = {
  externalId: string;
  title: string;
  source: ChatImportSource;
  createdAt: string;
  updatedAt: string;
  messages: ImportedMessage[];
};

export type ImportedConversationPreview = {
  externalId: string;
  title: string;
  source: ChatImportSource;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export const IMPORT_MAX_CONVERSATIONS = 50;
export const IMPORT_MAX_MESSAGES_PER_CONVERSATION = 500;
export const IMPORT_MAX_MESSAGE_CHARS = 50_000;
export const IMPORT_MAX_FILE_BYTES = 50 * 1024 * 1024;
