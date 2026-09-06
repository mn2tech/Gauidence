/**
 * Load / initialize Gideon conversation working state.
 * Always scoped by authenticated user_id + conversation_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActiveEntity,
  ConversationState,
  EvidenceRef,
  PendingAction,
  RuntimeIntent,
} from "./types";

function asEntityArray(raw: unknown): ActiveEntity[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && typeof e === "object" && typeof (e as ActiveEntity).name === "string") as ActiveEntity[];
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.length > 0);
}

function asEvidenceArray(raw: unknown): EvidenceRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e) =>
      e &&
      typeof e === "object" &&
      typeof (e as EvidenceRef).source_type === "string" &&
      typeof (e as EvidenceRef).source_id === "string"
  ) as EvidenceRef[];
}

function asPendingArray(raw: unknown): PendingAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a) =>
      a &&
      typeof a === "object" &&
      typeof (a as PendingAction).type === "string" &&
      typeof (a as PendingAction).status === "string"
  ) as PendingAction[];
}

export function emptyConversationState(
  userId: string,
  conversationId: string,
  nowIso: string = new Date().toISOString()
): ConversationState {
  return {
    conversation_id: conversationId,
    user_id: userId,
    active_goal: null,
    active_entities: [],
    active_space_ids: [],
    recent_evidence: [],
    conversation_summary: null,
    pending_actions: [],
    last_intent: null,
    last_user_message: null,
    last_assistant_message: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export function rowToConversationState(row: Record<string, unknown>): ConversationState {
  return {
    conversation_id: String(row.conversation_id),
    user_id: String(row.user_id),
    active_goal: typeof row.active_goal === "string" ? row.active_goal : null,
    active_entities: asEntityArray(row.active_entities),
    active_space_ids: asStringArray(row.active_space_ids),
    recent_evidence: asEvidenceArray(row.recent_evidence),
    conversation_summary:
      typeof row.conversation_summary === "string"
        ? row.conversation_summary
        : null,
    pending_actions: asPendingArray(row.pending_actions),
    last_intent:
      typeof row.last_intent === "string"
        ? (row.last_intent as RuntimeIntent)
        : null,
    last_user_message:
      typeof row.last_user_message === "string" ? row.last_user_message : null,
    last_assistant_message:
      typeof row.last_assistant_message === "string"
        ? row.last_assistant_message
        : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * Load state for this user+conversation. Returns null when the row belongs
 * to another user or does not exist (caller may initialize empty).
 */
export async function loadConversationState(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<ConversationState | null> {
  const { data, error } = await supabase
    .from("gideon_conversation_state")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Table may not exist yet in some envs — treat as empty.
    if (/schema cache|does not exist|gideon_conversation_state/i.test(error.message)) {
      console.warn(
        JSON.stringify({
          event: "gideon_runtime_state_load_skipped",
          reason: error.message.slice(0, 120),
        })
      );
      return null;
    }
    throw error;
  }
  if (!data) return null;
  // Defense in depth: never return another user's state
  if (String((data as { user_id?: string }).user_id) !== userId) {
    return null;
  }
  return rowToConversationState(data as Record<string, unknown>);
}

export async function loadOrInitConversationState(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<ConversationState> {
  const existing = await loadConversationState(supabase, userId, conversationId);
  return existing ?? emptyConversationState(userId, conversationId);
}

/**
 * Verify the vault chat belongs to this user. Used before loading state
 * when a conversation UUID is supplied manually.
 */
export async function assertConversationOwnedByUser(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("vault_chats")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}
