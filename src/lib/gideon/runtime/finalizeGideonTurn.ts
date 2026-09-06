/**
 * Finalize conversation state after the existing Gideon pipeline answers.
 */

import {
  extractEntitiesFromMessage,
  upsertActiveEntities,
} from "./entities";
import {
  shouldRefreshSummary,
  summarizeConversation,
} from "./summarizeConversation";
import { applyStatePatch } from "./updateConversationState";
import { logRuntimeEvent } from "./log";
import type {
  ConversationState,
  ConversationStateStore,
  EvidenceRef,
  GideonRuntimeContext,
  PendingAction,
} from "./types";

export async function finalizeGideonTurn(args: {
  store: ConversationStateStore;
  state: ConversationState;
  context: GideonRuntimeContext;
  userMessage: string;
  answer: string;
  evidence?: EvidenceRef[];
  pendingActions?: PendingAction[];
  spaceIds?: string[];
}): Promise<ConversationState> {
  const {
    store,
    context,
    userMessage,
    answer,
    evidence = [],
    pendingActions = [],
    spaceIds = [],
  } = args;

  try {
    const nowIso = new Date().toISOString();
    const fromAnswer = extractEntitiesFromMessage(
      `${userMessage}\n${answer.slice(0, 800)}`,
      nowIso
    );

    let next = applyStatePatch(
      args.state,
      {
        active_entities: upsertActiveEntities(
          args.state.active_entities,
          fromAnswer,
          nowIso
        ),
        recent_evidence: evidence,
        pending_actions: pendingActions,
        active_space_ids: spaceIds,
        last_user_message: userMessage,
        last_assistant_message: answer.slice(0, 4000),
      },
      nowIso
    );

    if (shouldRefreshSummary(next.conversation_summary, context.recentMessages.length + 2)) {
      next = applyStatePatch(
        next,
        {
          conversation_summary: summarizeConversation({
            previousSummary: next.conversation_summary,
            recentMessages: context.recentMessages,
            activeGoal: next.active_goal,
            activeEntities: next.active_entities,
            pendingActions: next.pending_actions,
            lastUserMessage: userMessage,
            lastAssistantMessage: answer,
          }),
        },
        nowIso
      );
    }

    await store.save(next);
    return next;
  } catch (err) {
    logRuntimeEvent("gideon_runtime_state_update", {
      conversation_id: args.state.conversation_id,
      success: false,
      error: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
    return args.state;
  }
}

export function evidenceFromCitations(
  citations: Array<{
    documentId?: string;
    fileName?: string;
    profileName?: string;
    sourceId?: string;
    itemId?: string;
    sourceType?: string;
  }>,
  spaceId?: string | null
): EvidenceRef[] {
  return citations
    .map((c, i) => {
      const source_id =
        c.documentId || c.sourceId || c.itemId || `citation-${i}`;
      if (!source_id) return null;
      return {
        source_type: c.sourceType || (c.documentId ? "document" : "citation"),
        source_id,
        title: c.fileName,
        space_id: spaceId ?? null,
        relevance: Math.max(0.5, 1 - i * 0.05),
      } satisfies EvidenceRef;
    })
    .filter((e): e is EvidenceRef => Boolean(e));
}
