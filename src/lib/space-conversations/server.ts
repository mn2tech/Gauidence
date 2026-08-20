import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { collaboratorDisplayName } from "@/lib/profiles/collaboratorDisplay";
import { loadCollaboratorMemberAccounts } from "@/lib/profiles/collaboratorMembers";
import { parseSuggestedQuestions } from "@/lib/gideon/suggestedQuestions";
import {
  SPACE_CONVERSATION_MESSAGE_SELECT,
  SPACE_CONVERSATION_SELECT,
  SPACE_KNOWLEDGE_ITEM_SELECT,
  type SpaceConversation,
  type SpaceConversationCitation,
  type SpaceConversationMessage,
  type SpaceKnowledgeItem,
} from "./types";

function parseCitations(raw: unknown): SpaceConversationCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: SpaceConversationCitation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const documentId =
      typeof row.documentId === "string"
        ? row.documentId
        : typeof row.document_id === "string"
          ? row.document_id
          : "";
    const fileName =
      typeof row.fileName === "string"
        ? row.fileName
        : typeof row.file_name === "string"
          ? row.file_name
          : "";
    if (!documentId || !fileName) continue;
    out.push({
      documentId,
      fileName,
      profileName:
        typeof row.profileName === "string" ? row.profileName : undefined,
      page: typeof row.page === "number" ? row.page : null,
      isImage: Boolean(row.isImage),
      mimeType: typeof row.mimeType === "string" ? row.mimeType : null,
      kind:
        row.kind === "knowledge" || row.kind === "connector"
          ? row.kind
          : "vault",
      knowledgeItemId:
        typeof row.knowledgeItemId === "string"
          ? row.knowledgeItemId
          : undefined,
      knowledgeKind:
        row.knowledgeKind === "decision" ||
        row.knowledgeKind === "task" ||
        row.knowledgeKind === "note"
          ? row.knowledgeKind
          : undefined,
    });
  }
  return out;
}

function mapMessageRow(row: Record<string, unknown>): SpaceConversationMessage {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    profile_id: String(row.profile_id),
    sender_user_id:
      typeof row.sender_user_id === "string" ? row.sender_user_id : null,
    sender_type: row.sender_type === "gideon" ? "gideon" : "user",
    content: String(row.content ?? ""),
    citations: parseCitations(row.citations),
    suggested_questions: parseSuggestedQuestions(row.suggested_questions),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    attached_document_id:
      typeof row.attached_document_id === "string"
        ? row.attached_document_id
        : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
  };
}

/** Get or create the single shared conversation for a Space. */
export async function getOrCreateSpaceConversation(
  supabase: SupabaseClient,
  profileId: string
): Promise<SpaceConversation> {
  const existing = await supabase
    .from("space_conversations")
    .select(SPACE_CONVERSATION_SELECT)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existing.data) {
    return existing.data as SpaceConversation;
  }

  const created = await supabase
    .from("space_conversations")
    .insert({ profile_id: profileId })
    .select(SPACE_CONVERSATION_SELECT)
    .single();

  if (created.error || !created.data) {
    // Race: another member created it
    const retry = await supabase
      .from("space_conversations")
      .select(SPACE_CONVERSATION_SELECT)
      .eq("profile_id", profileId)
      .single();
    if (retry.error || !retry.data) {
      throw new Error(
        created.error?.message ?? "Could not open Space Conversation."
      );
    }
    return retry.data as SpaceConversation;
  }

  return created.data as SpaceConversation;
}

export async function listSpaceConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 200
): Promise<SpaceConversationMessage[]> {
  const { data, error } = await supabase
    .from("space_conversation_messages")
    .select(SPACE_CONVERSATION_MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  const messages = (data ?? []).map((row) =>
    mapMessageRow(row as Record<string, unknown>)
  );
  return enrichMessages(supabase, messages);
}

async function enrichMessages(
  supabase: SupabaseClient,
  messages: SpaceConversationMessage[]
): Promise<SpaceConversationMessage[]> {
  if (!messages.length) return messages;

  const userIds = [
    ...new Set(
      messages
        .map((m) => m.sender_user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const accounts =
    userIds.length > 0
      ? await loadCollaboratorMemberAccounts(userIds)
      : new Map();

  const docIds = [
    ...new Set(
      messages
        .map((m) => m.attached_document_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const fileNames = new Map<string, string>();
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_name")
      .in("id", docIds);
    for (const d of docs ?? []) {
      fileNames.set(String(d.id), String(d.file_name));
    }
  }

  return messages.map((m) => ({
    ...m,
    sender_display_name:
      m.sender_type === "gideon"
        ? "Gideon"
        : collaboratorDisplayName(
            m.sender_user_id ? accounts.get(m.sender_user_id) : null
          ),
    attached_file_name: m.attached_document_id
      ? (fileNames.get(m.attached_document_id) ?? null)
      : null,
  }));
}

export async function listSpaceKnowledgeItems(
  supabase: SupabaseClient,
  profileId: string,
  kind?: string
): Promise<SpaceKnowledgeItem[]> {
  let q = supabase
    .from("space_knowledge_items")
    .select(SPACE_KNOWLEDGE_ITEM_SELECT)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (kind === "decision" || kind === "task" || kind === "note") {
    q = q.eq("kind", kind);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const items = (data ?? []) as SpaceKnowledgeItem[];
  const userIds = [...new Set(items.map((i) => i.created_by))];
  const accounts =
    userIds.length > 0
      ? await loadCollaboratorMemberAccounts(userIds)
      : new Map();

  return items.map((item) => ({
    ...item,
    created_by_display_name: collaboratorDisplayName(
      accounts.get(item.created_by)
    ),
  }));
}
