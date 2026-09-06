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

export async function prepareGideonTurn(args: {
  userId: string;
  conversationId: string;
  message: string;
  currentSpaceId?: string | null;
  recentMessages?: ChatTurn[];
  store: ConversationStateStore;
}): Promise<PrepareTurnResult> {
  const { userId, conversationId, message, currentSpaceId, store } = args;

  try {
    let state =
      (await store.load(userId, conversationId)) ??
      emptyConversationState(userId, conversationId);

    if (state.user_id !== userId) {
      logRuntimeEvent("gideon_runtime_access_denied", {
        conversation_id: conversationId,
      });
      return {
        context: {
          userMessage: message,
          resolvedMessage: message,
          activeGoal: null,
          activeEntities: [],
          conversationSummary: null,
          recentMessages: args.recentMessages ?? [],
          candidateSpaceIds: currentSpaceId ? [currentSpaceId] : [],
          lastIntent: null,
          needsClarification: false,
          clarificationPrompt: null,
        },
        state: emptyConversationState(userId, conversationId),
        fellBack: true,
      };
    }

    let recentMessages = args.recentMessages ?? [];
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
      recentMessages.length > 0;

    const intent = classifyRuntimeIntent(message, { hadPriorContext });
    const resolution = resolveReferences({
      message,
      activeEntities: state.active_entities,
      recentMessages,
    });

    logRuntimeEvent("gideon_runtime_resolution", {
      conversation_id: conversationId,
      intent,
      success: resolution.success,
      ambiguous: resolution.ambiguous,
      entity_count: state.active_entities.length,
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

    // Persist mid-turn working state so reload keeps entities/goal even if LLM fails
    await store.save(state);

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
    return {
      context: {
        userMessage: message,
        resolvedMessage: message,
        activeGoal: null,
        activeEntities: [],
        conversationSummary: null,
        recentMessages: args.recentMessages ?? [],
        candidateSpaceIds: currentSpaceId ? [currentSpaceId] : [],
        lastIntent: null,
        needsClarification: false,
        clarificationPrompt: null,
      },
      state: emptyConversationState(userId, conversationId),
      fellBack: true,
    };
  }
}
