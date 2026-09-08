/**
 * Shared turn preparation: load state, resolve refs, build context.
 * Does not call the LLM/retrieval pipeline.
 */

import { classifyRuntimeIntent } from "./classifyRuntimeIntent";
import { buildRuntimeContext } from "./buildRuntimeContext";
import {
  extractEntitiesFromMessage,
  inferImplicitOrganization,
  upsertActiveEntities,
} from "./entities";
import { inferActiveGoal } from "./inferActiveGoal";
import { emptyConversationState } from "./loadConversationState";
import { logRuntimeEvent } from "./log";
import { resolveReferences } from "./resolveReferences";
import { expandShortReplyFromHistory } from "./shortReplies";
import { applyStatePatch } from "./updateConversationState";
import type {
  ChatTurn,
  ConversationState,
  ConversationStateStore,
  GideonRuntimeContext,
} from "./types";
import { RECENT_MESSAGE_WINDOW } from "./types";

export type PrepareTurnResult = {
  context: GideonRuntimeContext;
  state: ConversationState;
  fellBack: boolean;
};

function continuityFallbackContext(args: {
  message: string;
  recentMessages: ChatTurn[];
  lastAssistantMessage?: string | null;
  currentSpaceId?: string | null;
}): GideonRuntimeContext {
  const shortExpanded = expandShortReplyFromHistory(
    args.message,
    args.recentMessages,
    args.lastAssistantMessage
  );
  return {
    userMessage: args.message,
    resolvedMessage: shortExpanded ?? args.message,
    activeGoal: null,
    activeEntities: [],
    conversationSummary: null,
    recentMessages: args.recentMessages,
    candidateSpaceIds: args.currentSpaceId ? [args.currentSpaceId] : [],
    lastIntent: null,
    needsClarification: false,
    clarificationPrompt: null,
    preferConversationContinuity: Boolean(shortExpanded),
  };
}

export async function prepareGideonTurn(args: {
  userId: string;
  conversationId: string;
  message: string;
  currentSpaceId?: string | null;
  recentMessages?: ChatTurn[];
  store: ConversationStateStore;
}): Promise<PrepareTurnResult> {
  const { userId, conversationId, message, currentSpaceId, store } = args;
  let recentMessages = args.recentMessages ?? [];

  try {
    let state =
      (await store.load(userId, conversationId)) ??
      emptyConversationState(userId, conversationId);

    if (state.user_id !== userId) {
      logRuntimeEvent("gideon_runtime_access_denied", {
        conversation_id: conversationId,
      });
      return {
        context: continuityFallbackContext({
          message,
          recentMessages,
          currentSpaceId,
        }),
        state: emptyConversationState(userId, conversationId),
        fellBack: true,
      };
    }

    if (!recentMessages.length && store.loadRecentMessages) {
      recentMessages = await store.loadRecentMessages(
        userId,
        conversationId,
        RECENT_MESSAGE_WINDOW
      );
    } else {
      recentMessages = recentMessages.slice(-RECENT_MESSAGE_WINDOW);
    }

    const nowIso = new Date().toISOString();
    const extracted = extractEntitiesFromMessage(message, nowIso);
    const withImplicit = [
      ...extracted,
      ...inferImplicitOrganization(message, state.active_entities, nowIso),
    ];
    const mergedEntities = upsertActiveEntities(
      state.active_entities,
      withImplicit,
      nowIso
    );

    state = applyStatePatch(
      state,
      {
        active_entities: mergedEntities,
        active_space_ids: currentSpaceId ? [currentSpaceId] : [],
      },
      nowIso
    );

    const hadPriorContext =
      state.active_entities.length > 0 ||
      Boolean(state.active_goal) ||
      recentMessages.length > 0 ||
      Boolean(state.last_assistant_message);

    const intent = classifyRuntimeIntent(message, { hadPriorContext });
    const resolution = resolveReferences({
      message,
      activeEntities: state.active_entities,
      recentMessages,
      lastAssistantMessage: state.last_assistant_message,
    });

    logRuntimeEvent("gideon_runtime_resolution", {
      conversation_id: conversationId,
      intent,
      success: resolution.success,
      ambiguous: resolution.ambiguous,
      entity_count: state.active_entities.length,
      continuity: Boolean(resolution.conversationContinuity),
    });

    const goal = inferActiveGoal({
      message,
      intent,
      previousGoal: state.active_goal,
      entityNames: state.active_entities.map((e) => e.name),
    });

    state = applyStatePatch(
      state,
      {
        active_goal: goal,
        last_intent: intent,
        last_user_message: message,
      },
      nowIso
    );

    // Persist mid-turn working state so reload keeps entities/goal even if LLM fails.
    // Never discard a successful short-reply resolution if save fails.
    try {
      await store.save(state);
    } catch (saveErr) {
      logRuntimeEvent("gideon_runtime_state_save_soft_fail", {
        conversation_id: conversationId,
        reason:
          saveErr instanceof Error
            ? saveErr.message.slice(0, 120)
            : "unknown",
      });
    }

    const context = buildRuntimeContext({
      userMessage: message,
      resolution,
      state,
      recentMessages,
      intent,
      currentSpaceId,
    });

    return { context, state, fellBack: false };
  } catch (err) {
    logRuntimeEvent("gideon_runtime_fallback", {
      conversation_id: conversationId,
      reason: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
    // Preserve short-reply continuity even when state load/save blew up.
    return {
      context: continuityFallbackContext({
        message,
        recentMessages: recentMessages.length
          ? recentMessages
          : (args.recentMessages ?? []),
        currentSpaceId,
      }),
      state: emptyConversationState(userId, conversationId),
      fellBack: true,
    };
  }
}
