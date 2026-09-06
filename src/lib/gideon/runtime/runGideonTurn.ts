/**
 * Primary entry: run one Gideon conversational turn with working-state continuity.
 */

import { prepareGideonTurn } from "./prepareGideonTurn.ts";
import { logRuntimeEvent } from "./log.ts";
import {
  shouldRefreshSummary,
  summarizeConversation,
} from "./summarizeConversation.ts";
import { applyStatePatch } from "./updateConversationState.ts";
import type {
  ConversationState,
  GideonTurnResult,
  PendingAction,
  RunGideonTurnArgs,
} from "./types.ts";

function inferPendingActions(
  message: string,
  intent: string,
  state: ConversationState
): PendingAction[] {
  const actions: PendingAction[] = [];
  const sol = state.active_entities.find((e) => e.type === "solicitation");
  const org = state.active_entities.find(
    (e) => e.type === "organization" || e.type === "client"
  );

  if (
    intent === "drafting" ||
    /\b(help me respond|draft|submit)\b/i.test(message)
  ) {
    if (sol) {
      actions.push({
        type: "respond_to_solicitation",
        status: "discussing",
        entity_id: sol.canonical_id ?? sol.name,
        target: org?.name,
      });
    } else {
      actions.push({
        type: "draft_response",
        status: "suggested",
        target: org?.name,
      });
    }
  }
  if (/\b(email|draft (an |a )?email)\b/i.test(message) && org) {
    actions.push({
      type: "draft_email",
      status: "suggested",
      target: org.name,
    });
  }
  return actions;
}

export async function runGideonTurn(
  args: RunGideonTurnArgs
): Promise<GideonTurnResult> {
  const started = Date.now();
  const {
    userId,
    conversationId,
    message,
    currentSpaceId,
    executePipeline,
    store,
  } = args;

  if (!store) {
    throw new Error(
      "runGideonTurn requires a ConversationStateStore (use createSupabaseStateStore or createMemoryStore)"
    );
  }

  logRuntimeEvent("gideon_runtime_turn_started", {
    conversation_id: conversationId,
    has_space: Boolean(currentSpaceId),
  });

  const prepared = await prepareGideonTurn({
    userId,
    conversationId,
    message,
    currentSpaceId,
    recentMessages: args.recentMessages,
    store,
  });

  let { context: ctx, state, fellBack } = prepared;

  if (ctx.needsClarification && ctx.clarificationPrompt) {
    const answer = ctx.clarificationPrompt;
    const nowIso = new Date().toISOString();
    state = applyStatePatch(
      state,
      {
        conversation_summary: summarizeConversation({
          previousSummary: state.conversation_summary,
          recentMessages: ctx.recentMessages,
          activeGoal: state.active_goal,
          activeEntities: state.active_entities,
          pendingActions: state.pending_actions,
          lastUserMessage: message,
          lastAssistantMessage: answer,
        }),
        last_assistant_message: answer,
      },
      nowIso
    );
    await store.save(state);

    const runtimeMs = Date.now() - started;
    logRuntimeEvent("gideon_runtime_turn_completed", {
      conversation_id: conversationId,
      intent: state.last_intent,
      entity_count: state.active_entities.length,
      resolution_success: false,
      runtime_ms: runtimeMs,
      clarification: true,
    });

    return {
      answer,
      conversationId,
      runtime: {
        resolvedMessage: ctx.resolvedMessage,
        activeGoal: state.active_goal,
        activeEntities: state.active_entities,
        lastIntent: state.last_intent,
        resolutionSuccess: false,
        ambiguous: true,
      },
      context: ctx,
      state,
      timings: { runtimeMs, retrievalMs: null, llmMs: null },
      fellBack: false,
    };
  }

  const pipelineResult = await executePipeline(ctx);
  const answer = pipelineResult.answer;

  try {
    const nowIso = new Date().toISOString();
    let next = applyStatePatch(
      state,
      {
        active_entities: pipelineResult.discoveredEntities ?? [],
        recent_evidence: pipelineResult.evidence ?? [],
        pending_actions: [
          ...inferPendingActions(
            message,
            state.last_intent ?? "general_question",
            state
          ),
          ...(pipelineResult.pendingActions ?? []),
        ],
        active_space_ids: [
          ...(currentSpaceId ? [currentSpaceId] : []),
          ...(pipelineResult.spaceIds ?? []),
        ],
        last_assistant_message: answer,
        last_user_message: message,
      },
      nowIso
    );

    if (
      shouldRefreshSummary(
        next.conversation_summary,
        (args.recentMessages?.length ?? 0) + 2
      )
    ) {
      next = applyStatePatch(
        next,
        {
          conversation_summary: summarizeConversation({
            previousSummary: next.conversation_summary,
            recentMessages: ctx.recentMessages,
            activeGoal: next.active_goal,
            activeEntities: next.active_entities,
            pendingActions: next.pending_actions,
            lastUserMessage: message,
            lastAssistantMessage: answer,
          }),
        },
        nowIso
      );
    }

    state = next;
    await store.save(state);
  } catch (err) {
    logRuntimeEvent("gideon_runtime_state_update", {
      conversation_id: conversationId,
      success: false,
      error: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
  }

  const runtimeMs = Date.now() - started;
  logRuntimeEvent("gideon_runtime_turn_completed", {
    conversation_id: conversationId,
    intent: state.last_intent,
    entity_count: state.active_entities.length,
    resolution_success: ctx.resolvedMessage !== ctx.userMessage,
    runtime_ms: runtimeMs,
    retrieval_ms: pipelineResult.retrievalDurationMs ?? null,
    llm_ms: pipelineResult.llmDurationMs ?? null,
    fell_back: fellBack,
  });

  return {
    answer,
    conversationId,
    runtime: {
      resolvedMessage: ctx.resolvedMessage,
      activeGoal: state.active_goal,
      activeEntities: state.active_entities,
      lastIntent: state.last_intent,
      resolutionSuccess: ctx.resolvedMessage !== message,
      ambiguous: false,
    },
    context: ctx,
    state,
    timings: {
      runtimeMs,
      retrievalMs: pipelineResult.retrievalDurationMs ?? null,
      llmMs: pipelineResult.llmDurationMs ?? null,
    },
    fellBack,
  };
}
