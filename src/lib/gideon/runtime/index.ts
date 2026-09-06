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
} from "./types.ts";

export {
  RECENT_MESSAGE_WINDOW,
  MAX_ACTIVE_ENTITIES,
  MAX_RECENT_EVIDENCE,
  MAX_PENDING_ACTIONS,
} from "./types.ts";

export { runGideonTurn } from "./runGideonTurn.ts";
export { prepareGideonTurn } from "./prepareGideonTurn.ts";
export {
  finalizeGideonTurn,
  evidenceFromCitations,
} from "./finalizeGideonTurn.ts";
export {
  emptyConversationState,
  loadConversationState,
  loadOrInitConversationState,
  assertConversationOwnedByUser,
  rowToConversationState,
} from "./loadConversationState.ts";
export {
  updateConversationState,
  applyStatePatch,
} from "./updateConversationState.ts";
export {
  extractEntitiesFromMessage,
  upsertActiveEntities,
  entityMatchesAlias,
  findEntitiesByPhrase,
  inferImplicitOrganization,
  entitiesOfType,
  mostRecentEntity,
} from "./entities.ts";
export { resolveReferences } from "./resolveReferences.ts";
export { classifyRuntimeIntent } from "./classifyRuntimeIntent.ts";
export { inferActiveGoal } from "./inferActiveGoal.ts";
export {
  summarizeConversation,
  shouldRefreshSummary,
} from "./summarizeConversation.ts";
export {
  buildRuntimeContext,
  formatRuntimeContextForPrompt,
} from "./buildRuntimeContext.ts";
export { createMemoryStore, ensureState } from "./memoryStore.ts";
export {
  createSupabaseStateStore,
  initEmptyConversationState,
} from "./supabaseStore.ts";
export { logRuntimeEvent } from "./log.ts";
