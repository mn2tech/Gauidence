/**
 * Gideon Conversation Runtime v1
 *
 * Sits between Ask Gideon and the existing retrieval/LLM pipeline.
 * Maintains working conversational state (entities, goal, summary, evidence).
 */

export type {
  ActiveEntity,
  ActiveEntityType,
  ChatTurn,
  ConversationState,
  ConversationStateStore,
  EvidenceRef,
  GideonPipelineResult,
  GideonRuntimeContext,
  GideonTurnResult,
  PendingAction,
  ReferenceResolution,
  RunGideonTurnArgs,
  RuntimeDebugSnapshot,
  RuntimeIntent,
} from "./types";

export {
  RECENT_MESSAGE_WINDOW,
  MAX_ACTIVE_ENTITIES,
  MAX_RECENT_EVIDENCE,
  MAX_PENDING_ACTIONS,
} from "./types";

export { runGideonTurn } from "./runGideonTurn";
export { prepareGideonTurn } from "./prepareGideonTurn";
export {
  finalizeGideonTurn,
  evidenceFromCitations,
} from "./finalizeGideonTurn";
export {
  emptyConversationState,
  loadConversationState,
  loadOrInitConversationState,
  assertConversationOwnedByUser,
  rowToConversationState,
} from "./loadConversationState";
export {
  updateConversationState,
  applyStatePatch,
} from "./updateConversationState";
export {
  extractEntitiesFromMessage,
  upsertActiveEntities,
  entityMatchesAlias,
  findEntitiesByPhrase,
  inferImplicitOrganization,
  entitiesOfType,
  mostRecentEntity,
} from "./entities";
export { resolveReferences } from "./resolveReferences";
export {
  isShortConversationalReply,
  expandShortReplyFromHistory,
  shouldPreferContinuityEmptyFallback,
} from "./shortReplies";
export { classifyRuntimeIntent } from "./classifyRuntimeIntent";
export { inferActiveGoal } from "./inferActiveGoal";
export {
  summarizeConversation,
  shouldRefreshSummary,
} from "./summarizeConversation";
export {
  buildRuntimeContext,
  formatRuntimeContextForPrompt,
} from "./buildRuntimeContext";
export { createMemoryStore, ensureState } from "./memoryStore";
export {
  createSupabaseStateStore,
  initEmptyConversationState,
} from "./supabaseStore";
export { logRuntimeEvent } from "./log";
