/**
 * In-memory ConversationStateStore for unit tests.
 */

import { emptyConversationState } from "./loadConversationState.ts";
import type {
  ChatTurn,
  ConversationState,
  ConversationStateStore,
} from "./types.ts";

export function createMemoryStore(seed?: {
  states?: ConversationState[];
  messages?: Record<string, ChatTurn[]>;
}): ConversationStateStore & {
  states: Map<string, ConversationState>;
  messages: Map<string, ChatTurn[]>;
} {
  const states = new Map<string, ConversationState>();
  const messages = new Map<string, ChatTurn[]>();

  for (const s of seed?.states ?? []) {
    states.set(`${s.user_id}::${s.conversation_id}`, { ...s });
  }
  for (const [key, turns] of Object.entries(seed?.messages ?? {})) {
    messages.set(key, turns);
  }

  return {
    states,
    messages,
    async load(userId, conversationId) {
      const row = states.get(`${userId}::${conversationId}`);
      if (!row) return null;
      if (row.user_id !== userId) return null;
      return { ...row, active_entities: [...row.active_entities] };
    },
    async save(state) {
      if (!state.user_id) throw new Error("user_id required");
      states.set(`${state.user_id}::${state.conversation_id}`, {
        ...state,
        active_entities: [...state.active_entities],
      });
    },
    async loadRecentMessages(userId, conversationId, limit) {
      const key = `${userId}::${conversationId}`;
      const turns = messages.get(key) ?? [];
      return turns.slice(-limit);
    },
  };
}

export function ensureState(
  store: ReturnType<typeof createMemoryStore>,
  userId: string,
  conversationId: string
): ConversationState {
  const key = `${userId}::${conversationId}`;
  const existing = store.states.get(key);
  if (existing) return existing;
  const empty = emptyConversationState(userId, conversationId);
  store.states.set(key, empty);
  return empty;
}
