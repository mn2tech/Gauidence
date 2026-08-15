/**
 * Guardian Business Pack V1.1 — Gideon Business Intelligence types.
 * Query plans and claims are internal; do not surface plan labels to users.
 */

export const BUSINESS_QUERY_INTENTS = [
  "ENTITY_360",
  "RELATIONSHIP_QUERY",
  "PROPOSAL_ANALYSIS",
  "PROJECT_ANALYSIS",
  "COMMITMENT_ANALYSIS",
  "EVIDENCE_REQUEST",
  "BUSINESS_STATUS",
  "ADVISORY",
  "GENERAL_KNOWLEDGE",
] as const;

export type BusinessQueryIntent = (typeof BUSINESS_QUERY_INTENTS)[number];

export type BusinessQueryPlan = {
  intent: BusinessQueryIntent;
  entities: string[];
  requiresOntology: boolean;
  requiresStructuredData: boolean;
  requiresSearch: boolean;
  requiresEvidence: boolean;
  /** Internal retrieval strategy label for observability. */
  strategy: string;
};

export const KNOWLEDGE_CATEGORIES = [
  "BUSINESS_FACT",
  "BUSINESS_RELATIONSHIP",
  "BUSINESS_COMMITMENT",
  "BUSINESS_EVENT",
  "BUSINESS_RISK",
  "BUSINESS_OPPORTUNITY",
  "SYSTEM_METADATA",
  "PROCESS_METADATA",
  "LOW_VALUE",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/** Categories allowed in normal business answers about clients/orgs. */
export const BUSINESS_FACING_CATEGORIES: ReadonlySet<KnowledgeCategory> = new Set([
  "BUSINESS_FACT",
  "BUSINESS_RELATIONSHIP",
  "BUSINESS_COMMITMENT",
  "BUSINESS_EVENT",
  "BUSINESS_RISK",
  "BUSINESS_OPPORTUNITY",
]);

export type ClaimEvidenceRef = {
  sourceId: string;
  sourceType: string;
  reference?: string;
  label?: string;
  href?: string;
};

export type GideonClaim = {
  claim: string;
  evidence: ClaimEvidenceRef[];
  confidence?: number;
  kind?: "KNOWN_FACT" | "RECOMMENDATION";
};

export type CommitmentStatus =
  | "PROPOSED"
  | "RECOMMENDED"
  | "AGREED"
  | "COMMITTED"
  | "COMPLETED"
  | "CANCELLED"
  | "UNKNOWN";

export type BusinessCommitment = {
  id: string;
  organization_id: string;
  client_entity_id: string | null;
  source_entity_id: string | null;
  description: string;
  commitment_type: string | null;
  status: CommitmentStatus;
  due_date: string | null;
  owner_entity_id: string | null;
  confidence: number | null;
  evidence_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Entity360Relationship = {
  type: string;
  direction: "outgoing" | "incoming";
  relatedName: string;
  relatedType: string;
  relatedId: string;
};

export type Entity360Proposal = {
  id: string;
  title: string;
  status: string;
  amountLabel: string | null;
  clientName: string | null;
  updatedAt: string | null;
  sentAt: string | null;
};

export type Entity360Item = {
  id: string;
  name: string;
  type: string;
  summary?: string | null;
  status?: string | null;
};

export type Entity360Evidence = {
  id: string;
  text: string;
  documentName: string | null;
  documentId: string | null;
  sourceType: string;
};

export type Entity360 = {
  entity: {
    id: string;
    name: string;
    type: string;
    aliases: string[];
    description: string | null;
    domain: string | null;
    confidence: number | null;
  };
  relationships: Entity360Relationship[];
  people: Entity360Item[];
  proposals: Entity360Proposal[];
  projects: Entity360Item[];
  contracts: Entity360Item[];
  assessments: Entity360Item[];
  commitments: Array<{
    description: string;
    status: CommitmentStatus;
    dueDate: string | null;
  }>;
  risks: Entity360Item[];
  recentActivity: Entity360Item[];
  evidence: Entity360Evidence[];
  gaps: string[];
};

export type ProposalFollowUpCandidate = {
  proposalId: string;
  title: string;
  clientName: string;
  amountLabel: string | null;
  status: string;
  score: number;
  reasons: string[];
  recommendedAction: string;
};

export type AdvisoryInsight = {
  type: string;
  entityId: string | null;
  title: string;
  summary: string;
  priority: number;
  urgency: number;
  businessImpact: number;
  confidence: number;
  why: string;
  evidence: ClaimEvidenceRef[];
  recommendedNextStep: string;
  suggestedActions?: Array<{
    id: string;
    label: string;
  }>;
};

export type BusinessIntelligenceBundle = {
  plan: BusinessQueryPlan;
  entity360: Entity360 | null;
  relationshipAnswers: string[];
  proposalFollowUps: ProposalFollowUpCandidate[];
  commitmentsByClient: Array<{
    clientName: string;
    clientEntityId: string | null;
    commitments: Array<{
      description: string;
      status: CommitmentStatus;
      dueDate: string | null;
    }>;
  }>;
  advisory: AdvisoryInsight[];
  priorClaims: GideonClaim[];
  claims: GideonClaim[];
  promptBlock: string;
  observability: BusinessBiObservability;
};

export type BusinessBiObservability = {
  question: string;
  intent: BusinessQueryIntent;
  entities: string[];
  strategy: string;
  ontologyHitCount: number;
  structuredHitCount: number;
  evidenceSelected: number;
  claimsGenerated: number;
  filteredSystemMetadata: number;
};
