/**
 * Build normalized runtime context for the downstream Gideon pipeline.
 */

import type {
  ActiveEntity,
  ChatTurn,
  ConversationState,
  GideonRuntimeContext,
  ReferenceResolution,
  RuntimeIntent,
} from "./types.ts";

export function buildRuntimeContext(args: {
  userMessage: string;
  resolution: ReferenceResolution;
  state: ConversationState;
  recentMessages: ChatTurn[];
  intent: RuntimeIntent;
  currentSpaceId?: string | null;
}): GideonRuntimeContext {
  const {
    userMessage,
    resolution,
    state,
    recentMessages,
    intent,
    currentSpaceId,
  } = args;

  const spaceIds = new Set<string>(state.active_space_ids ?? []);
  if (currentSpaceId) spaceIds.add(currentSpaceId);

  return {
    userMessage,
    resolvedMessage: resolution.ambiguous
      ? userMessage
      : resolution.resolvedMessage || userMessage,
    activeGoal: state.active_goal,
    activeEntities: state.active_entities as ActiveEntity[],
    conversationSummary: state.conversation_summary,
    recentMessages,
    candidateSpaceIds: [...spaceIds],
    lastIntent: intent,
    needsClarification: Boolean(resolution.ambiguous && resolution.clarificationPrompt),
    clarificationPrompt: resolution.clarificationPrompt,
  };
}

/** Prompt block injected into retrieval / LLM when runtime context is rich. */
export function formatRuntimeContextForPrompt(ctx: GideonRuntimeContext): string {
  const lines: string[] = [];
  if (ctx.activeGoal) lines.push(`Active goal: ${ctx.activeGoal}`);
  if (ctx.conversationSummary) {
    lines.push(`Conversation summary: ${ctx.conversationSummary}`);
  }
  if (ctx.activeEntities.length) {
    lines.push(
      "Active entities: " +
        ctx.activeEntities
          .map((e) => {
            const id = e.canonical_id ? ` (${e.canonical_id})` : "";
            return `${e.name}${id} [${e.type}]`;
          })
          .join("; ")
    );
  }
  if (ctx.resolvedMessage !== ctx.userMessage) {
    lines.push(`Resolved question: ${ctx.resolvedMessage}`);
  }
  if (!lines.length) return "";
  return [
    "CONVERSATION RUNTIME CONTEXT (use for continuity; do not invent entities):",
    ...lines,
  ].join("\n");
}
