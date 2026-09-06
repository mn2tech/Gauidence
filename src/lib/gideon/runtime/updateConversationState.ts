/**
 * Persist Gideon conversation working state (user-scoped upsert).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActiveEntity,
  ConversationState,
  EvidenceRef,
  PendingAction,
} from "./types.ts";
import {
  MAX_ACTIVE_ENTITIES,
  MAX_PENDING_ACTIONS,
  MAX_RECENT_EVIDENCE,
} from "./types.ts";
import { upsertActiveEntities } from "./entities.ts";
import { logRuntimeEvent } from "./log.ts";

function dedupeEvidence(items: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  const out: EvidenceRef[] = [];
  for (const e of items) {
    const key = `${e.source_type}:${e.source_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= MAX_RECENT_EVIDENCE) break;
  }
  return out;
}

function dedupeActions(items: PendingAction[]): PendingAction[] {
  const seen = new Set<string>();
  const out: PendingAction[] = [];
  for (const a of items) {
    const key = `${a.type}:${a.target ?? ""}:${a.entity_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length >= MAX_PENDING_ACTIONS) break;
  }
  return out;
}

export function applyStatePatch(
  current: ConversationState,
  patch: {
    active_goal?: string | null;
    active_entities?: ActiveEntity[];
    active_space_ids?: string[];
    recent_evidence?: EvidenceRef[];
    conversation_summary?: string | null;
    pending_actions?: PendingAction[];
    last_intent?: ConversationState["last_intent"];
    last_user_message?: string | null;
    last_assistant_message?: string | null;
  },
  nowIso: string = new Date().toISOString()
): ConversationState {
  const entities = patch.active_entities
    ? upsertActiveEntities(current.active_entities, patch.active_entities, nowIso).slice(
        0,
        MAX_ACTIVE_ENTITIES
      )
    : current.active_entities;

  const spaces = [
    ...new Set([
      ...(current.active_space_ids ?? []),
      ...(patch.active_space_ids ?? []),
    ]),
  ].filter(Boolean);

  const evidence = dedupeEvidence([
    ...(patch.recent_evidence ?? []),
    ...current.recent_evidence,
  ]);

  const actions = dedupeActions([
    ...(patch.pending_actions ?? []),
    ...current.pending_actions,
  ]);

  return {
    ...current,
    active_goal:
      patch.active_goal !== undefined ? patch.active_goal : current.active_goal,
    active_entities: entities,
    active_space_ids: spaces,
    recent_evidence: evidence,
    conversation_summary:
      patch.conversation_summary !== undefined
        ? patch.conversation_summary
        : current.conversation_summary,
    pending_actions: actions,
    last_intent:
      patch.last_intent !== undefined ? patch.last_intent : current.last_intent,
    last_user_message:
      patch.last_user_message !== undefined
        ? patch.last_user_message
        : current.last_user_message,
    last_assistant_message:
      patch.last_assistant_message !== undefined
        ? patch.last_assistant_message
        : current.last_assistant_message,
    updated_at: nowIso,
  };
}

export async function updateConversationState(
  supabase: SupabaseClient,
  state: ConversationState
): Promise<{ ok: boolean; error?: string }> {
  if (!state.user_id || !state.conversation_id) {
    return { ok: false, error: "missing_ids" };
  }

  const row = {
    conversation_id: state.conversation_id,
    user_id: state.user_id,
    active_goal: state.active_goal,
    active_entities: state.active_entities,
    active_space_ids: state.active_space_ids,
    recent_evidence: state.recent_evidence,
    conversation_summary: state.conversation_summary,
    pending_actions: state.pending_actions,
    last_intent: state.last_intent,
    last_user_message: state.last_user_message,
    last_assistant_message: state.last_assistant_message,
    updated_at: state.updated_at || new Date().toISOString(),
  };

  const { error } = await supabase
    .from("gideon_conversation_state")
    .upsert(row, { onConflict: "conversation_id" });

  if (error) {
    logRuntimeEvent("gideon_runtime_state_update", {
      conversation_id: state.conversation_id,
      success: false,
      error: error.message.slice(0, 160),
    });
    return { ok: false, error: error.message };
  }

  logRuntimeEvent("gideon_runtime_state_update", {
    conversation_id: state.conversation_id,
    success: true,
    entity_count: state.active_entities.length,
  });
  return { ok: true };
}
