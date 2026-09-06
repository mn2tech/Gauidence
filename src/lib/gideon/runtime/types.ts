/**
 * Gideon Conversation Runtime v1 — types.
 * Working conversational state for Ask Gideon continuity.
 * Do not expose chain-of-thought; runtime metadata is structured only.
 */

export type ActiveEntityType =
  | "person"
  | "organization"
  | "project"
  | "solicitation"
  | "client"
  | "document"
  | "event"
  | "task"
  | "space"
  | "generic_topic"
  | "proposal";

export type ActiveEntity = {
  type: ActiveEntityType;
  name: string;
  /** Canonical business / solicitiation id when known (e.g. BPM 57598). */
  canonical_id?: string | null;
  source_id?: string | null;
  confidence: number;
  aliases?: string[];
  last_referenced_at?: string;
};

export type EvidenceRef = {
  source_type: string;
  source_id: string;
  title?: string;
  space_id?: string | null;
  relevance?: number;
};

export type PendingActionStatus =
  | "suggested"
  | "discussing"
  | "deferred"
  | "completed"
  | "cancelled";

export type PendingAction = {
  type: string;
  status: PendingActionStatus;
  target?: string;
  entity_id?: string;
  note?: string;
};

/** Lightweight runtime intents — not the capability router intents. */
export type RuntimeIntent =
  | "general_question"
  | "knowledge_lookup"
  | "person_lookup"
  | "document_lookup"
  | "opportunity_lookup"
  | "summarize"
  | "compare"
  | "qualification_analysis"
  | "planning"
  | "drafting"
  | "action_request"
  | "follow_up"
  | "clarification";

export type ConversationState = {
  conversation_id: string;
  user_id: string;
  active_goal: string | null;
  active_entities: ActiveEntity[];
  active_space_ids: string[];
  recent_evidence: EvidenceRef[];
  conversation_summary: string | null;
  pending_actions: PendingAction[];
  last_intent: RuntimeIntent | null;
  last_user_message: string | null;
  last_assistant_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ReferenceResolution = {
  resolvedMessage: string;
  success: boolean;
  ambiguous: boolean;
  clarificationPrompt: string | null;
  bindings: Array<{
    phrase: string;
    entityName: string;
    entityType: ActiveEntityType;
  }>;
};

export type GideonRuntimeContext = {
  userMessage: string;
  resolvedMessage: string;
  activeGoal: string | null;
  activeEntities: ActiveEntity[];
  conversationSummary: string | null;
  recentMessages: ChatTurn[];
  candidateSpaceIds: string[];
  lastIntent: RuntimeIntent | null;
  needsClarification: boolean;
  clarificationPrompt: string | null;
};

export type RuntimeDebugSnapshot = {
  resolvedMessage: string;
  activeGoal: string | null;
  activeEntities: ActiveEntity[];
  lastIntent: RuntimeIntent | null;
  resolutionSuccess: boolean;
  ambiguous: boolean;
};

export type GideonPipelineResult = {
  answer: string;
  /** Lightweight evidence discovered this turn (citations, guardian items, etc.). */
  evidence?: EvidenceRef[];
  /** Entities discovered from retrieval / answer (optional). */
  discoveredEntities?: ActiveEntity[];
  /** Suggested pending actions (optional; Sprint 1 stores only). */
  pendingActions?: PendingAction[];
  /** Space ids touched / mentioned this turn. */
  spaceIds?: string[];
  retrievalDurationMs?: number;
  llmDurationMs?: number;
};

export type RunGideonTurnArgs = {
  userId: string;
  conversationId: string;
  message: string;
  currentSpaceId?: string | null;
  /** Preloaded recent messages; when omitted, loader may fetch. */
  recentMessages?: ChatTurn[];
  /**
   * Existing retrieval + LLM pipeline. Receives resolved runtime context.
   * On runtime failure, called with a minimal context (raw message only).
   */
  executePipeline: (
    ctx: GideonRuntimeContext
  ) => Promise<GideonPipelineResult>;
  /** Optional persistence adapters (tests inject in-memory). */
  store?: ConversationStateStore;
};

export type ConversationStateStore = {
  load: (
    userId: string,
    conversationId: string
  ) => Promise<ConversationState | null>;
  save: (state: ConversationState) => Promise<void>;
  loadRecentMessages?: (
    userId: string,
    conversationId: string,
    limit: number
  ) => Promise<ChatTurn[]>;
};

export type GideonTurnResult = {
  answer: string;
  conversationId: string;
  runtime: RuntimeDebugSnapshot;
  context: GideonRuntimeContext;
  state: ConversationState;
  timings: {
    runtimeMs: number;
    retrievalMs: number | null;
    llmMs: number | null;
  };
  /** True when runtime prep failed and we fell back to raw-message pipeline. */
  fellBack: boolean;
};

export const RECENT_MESSAGE_WINDOW = 10;
export const MAX_ACTIVE_ENTITIES = 12;
export const MAX_RECENT_EVIDENCE = 16;
export const MAX_PENDING_ACTIONS = 8;
