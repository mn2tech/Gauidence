/**
 * Shared types for Gideon's knowledge-first orchestration layer.
 * Do not expose routing metadata to ordinary users.
 */

export type GideonKnowledgeIntent =
  | "guardian_knowledge"
  | "general_knowledge"
  | "guardian_plus_general"
  | "action"
  | "conversation"
  | "clarification";

/** Default answer length. Prefer short unless the user asks to expand. */
export type OrchestrationResponseDepth = "short" | "explain" | "deep";

export const DEFAULT_RESPONSE_DEPTH: OrchestrationResponseDepth = "short";

export type KnowledgeSource =
  | "guardian"
  | "general"
  | "guardian_and_general";

export type KnowledgeStatus = "known" | "partially_known" | "unknown";

export type GuardianFact = {
  subject: string;
  predicate: string;
  value: string;
  sourceLabel?: string;
  confidence: number;
  knowledgeSource: KnowledgeSource;
};

export type RetrievalEvidence = {
  id: string;
  text: string;
  score: number;
  documentId?: string | null;
  fileName?: string | null;
  spaceId?: string | null;
  spaceName?: string | null;
};

export type OntologyEntityRef = {
  id?: string;
  name: string;
  type?: string;
  attributes?: Record<string, string>;
};

export type OntologyRelationshipRef = {
  subject: string;
  predicate: string;
  object: string;
};

export type GuardianEventRef = {
  name: string;
  when?: string;
  notes?: string;
};

export type GuardianCommitmentRef = {
  subject: string;
  description: string;
  due?: string;
};

export type GuardianKnowledgeResult = {
  status: KnowledgeStatus;
  directFacts: GuardianFact[];
  retrievalEvidence: RetrievalEvidence[];
  entities: OntologyEntityRef[];
  relationships: OntologyRelationshipRef[];
  events: GuardianEventRef[];
  commitments: GuardianCommitmentRef[];
  confidence: number;
  spaceId?: string;
  spaceName?: string;
};

/** Admin / Test Lab only — never send to ordinary user chats. */
export type OrchestrationDebugSnapshot = {
  intent: GideonKnowledgeIntent;
  responseDepth: OrchestrationResponseDepth;
  space?: string;
  knowledgeStatus?: KnowledgeStatus;
  guardianKnowledgeRequired: boolean;
  generalKnowledgeAllowed: boolean;
  knowledgeSource: KnowledgeSource;
  retrievedEvidenceCount: number;
  ontologyEntityCount: number;
  confidence: number;
  reasoning?: string;
};
