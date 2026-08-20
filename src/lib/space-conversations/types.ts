/**
 * Space Conversations — shared knowledge-aware discussion on a Guardian Space.
 * Distinct from private Ask Gideon (vault_chats).
 */

export const SPACE_KNOWLEDGE_KINDS = ["decision", "task", "note"] as const;
export type SpaceKnowledgeKind = (typeof SPACE_KNOWLEDGE_KINDS)[number];

export function isSpaceKnowledgeKind(v: unknown): v is SpaceKnowledgeKind {
  return (
    typeof v === "string" &&
    (SPACE_KNOWLEDGE_KINDS as readonly string[]).includes(v)
  );
}

export type SpaceConversationSenderType = "user" | "gideon";

/** Citation shape shared with Ask Gideon vault citations. */
export type SpaceConversationCitation = {
  documentId: string;
  fileName: string;
  profileName?: string;
  page?: number | null;
  isImage?: boolean;
  mimeType?: string | null;
  kind?: "vault" | "knowledge" | "connector";
  /** For durable knowledge items used as sources. */
  knowledgeItemId?: string;
  knowledgeKind?: SpaceKnowledgeKind;
};

export type SpaceConversation = {
  id: string;
  profile_id: string;
  created_at: string;
  updated_at: string;
};

export type SpaceConversationMessage = {
  id: string;
  conversation_id: string;
  profile_id: string;
  sender_user_id: string | null;
  sender_type: SpaceConversationSenderType;
  content: string;
  citations: SpaceConversationCitation[];
  suggested_questions: string[];
  metadata: Record<string, unknown>;
  attached_document_id: string | null;
  created_at: string;
  updated_at: string;
  /** Enriched for UI */
  sender_display_name?: string | null;
  attached_file_name?: string | null;
};

export type SpaceKnowledgeItem = {
  id: string;
  profile_id: string;
  kind: SpaceKnowledgeKind;
  title: string | null;
  content: string;
  created_by: string;
  source_conversation_id: string | null;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_display_name?: string | null;
};

export const SPACE_CONVERSATION_SELECT =
  "id, profile_id, created_at, updated_at";

export const SPACE_CONVERSATION_MESSAGE_SELECT =
  "id, conversation_id, profile_id, sender_user_id, sender_type, content, citations, suggested_questions, metadata, attached_document_id, created_at, updated_at";

export const SPACE_KNOWLEDGE_ITEM_SELECT =
  "id, profile_id, kind, title, content, created_by, source_conversation_id, source_message_id, created_at, updated_at";

export function knowledgeKindLabel(kind: SpaceKnowledgeKind): string {
  if (kind === "decision") return "Decision";
  if (kind === "task") return "Task";
  return "Note";
}
