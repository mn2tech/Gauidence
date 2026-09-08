/**
 * Supabase-backed ConversationStateStore for Ask Gideon threads.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadConversationState,
  emptyConversationState,
} from "./loadConversationState";
import { updateConversationState } from "./updateConversationState";
import type { ChatTurn, ConversationStateStore } from "./types";
import { RECENT_MESSAGE_WINDOW } from "./types";

export function createSupabaseStateStore(
  supabase: SupabaseClient
): ConversationStateStore {
  return {
    async load(userId, conversationId) {
      return loadConversationState(supabase, userId, conversationId);
    },
    async save(state) {
      // Ensure user_id is set before write
      if (!state.user_id) {
        throw new Error("refusing to save conversation state without user_id");
      }
      const result = await updateConversationState(supabase, state);
      if (!result.ok && result.error && !/schema cache|does not exist/i.test(result.error)) {
        throw new Error(result.error);
      }
    },
    async loadRecentMessages(userId, conversationId, limit = RECENT_MESSAGE_WINDOW) {
      // Newest-first so long threads still include the last assistant turn.
      const { data, error } = await supabase
        .from("vault_chat_messages")
        .select("role, content")
        .eq("chat_id", conversationId)
        .eq("user_id", userId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: false })
        .limit(Math.max(limit, 1));

      if (error || !data) return [];
      const turns: ChatTurn[] = data
        .filter((r) => r.role === "user" || r.role === "assistant")
        .map((r) => ({
          role: r.role as "user" | "assistant",
          content: String(r.content ?? "").slice(0, 1200),
        }));
      return turns.reverse();
    },
  };
}

export async function initEmptyConversationState(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  currentSpaceId?: string | null
): Promise<void> {
  const state = emptyConversationState(userId, conversationId);
  if (currentSpaceId) {
    state.active_space_ids = [currentSpaceId];
  }
  await updateConversationState(supabase, state);
}
