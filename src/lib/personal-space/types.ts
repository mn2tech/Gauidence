/** Confidence bands for Personal Space knowledge. */
export type KnowledgeConfidenceLevel = "high" | "medium" | "low";

/** How deeply Gideon should answer. Default is 1. */
export type ResponseDepth = 1 | 2 | 3 | 4;

export type PersonalKnowledgeCategory =
  | "people"
  | "family"
  | "home"
  | "vehicles"
  | "documents"
  | "important_dates"
  | "travel"
  | "goals"
  | "projects"
  | "receipts"
  | "subscriptions"
  | "tasks"
  | "events"
  | "memories"
  | "organizations"
  | "relationships"
  | "commitments"
  | "other";

export type PersonalEntityKind =
  | "person"
  | "organization"
  | "vehicle"
  | "event"
  | "commitment"
  | "document"
  | "location"
  | "asset"
  | "task"
  | "other";

export type PersonalFactStatus =
  | "confirmed"
  | "provisional"
  | "rejected"
  | "corrected";

export type PersonalEntity = {
  id?: string;
  name: string;
  kind: PersonalEntityKind;
  category?: PersonalKnowledgeCategory;
  attributes?: Record<string, string>;
  confidence: number;
  confidenceLevel: KnowledgeConfidenceLevel;
  status: PersonalFactStatus;
  sourceExcerpt?: string;
};

export type PersonalRelationship = {
  id?: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  confidenceLevel: KnowledgeConfidenceLevel;
  status: PersonalFactStatus;
  sourceExcerpt?: string;
};

export type PersonalFact = {
  id?: string;
  subject: string;
  predicate: string;
  object?: string;
  value?: string;
  confidence: number;
  confidenceLevel: KnowledgeConfidenceLevel;
  status: PersonalFactStatus;
  sourceExcerpt?: string;
  sourceDocumentId?: string | null;
  sourceFileName?: string | null;
  category?: PersonalKnowledgeCategory;
};

export type ConfirmationPrompt = {
  question: string;
  candidate: PersonalFact | PersonalRelationship | PersonalEntity;
  reason: "uncertain" | "medium_confidence" | "important";
};

export type ConversationExtractionResult = {
  entities: PersonalEntity[];
  relationships: PersonalRelationship[];
  facts: PersonalFact[];
  confirmations: ConfirmationPrompt[];
  rememberReply: string | null;
};

export type PersonalKnowledgeStore = {
  entities: PersonalEntity[];
  relationships: PersonalRelationship[];
  facts: PersonalFact[];
};

export type KnowledgeHealthDimension =
  | "identity"
  | "people"
  | "important_dates"
  | "documents"
  | "relationships"
  | "assets"
  | "activities"
  | "commitments";

export type KnowledgeHealthSnapshot = {
  label: "Getting started" | "Growing" | "Strong";
  counts: {
    people: number;
    vehicles: number;
    documents: number;
    importantDates: number;
    commitments: number;
    organizations: number;
    events: number;
  };
  dimensions: Record<KnowledgeHealthDimension, boolean>;
  suggestedNextStep: string | null;
  visibleCategories: PersonalKnowledgeCategory[];
};

export type RetrievalSourceLayer =
  | "structured_knowledge"
  | "documents"
  | "other_spaces"
  | "general_model"
  | "web";

export type PersonalAnswer = {
  text: string;
  depth: ResponseDepth;
  sourceLayer: RetrievalSourceLayer;
  sources: { label: string; documentId?: string }[];
  known: boolean;
};

export const PERSONAL_SPACE_DISPLAY_NAME = "My Personal Space";

export const PERSONAL_SPACE_WELCOME = {
  title: "Welcome to Guardian",
  body: "What would you like Guardian to remember? Add something, tell Gideon a note, connect a source, or just ask — Guardian organizes the rest.",
} as const;

export const PERSONAL_SPACE_ACTIONS = [
  {
    id: "add-something",
    label: "Add something",
    description: "Upload files, notes, receipts, and more",
    href: "/add",
  },
  {
    id: "tell-guardian",
    label: "Tell Guardian",
    description: "Save a quick note to History — no Space required",
    href: "/history?tell=1",
  },
  {
    id: "connect-something",
    label: "Connect something",
    description: "Link Drive, email, or other sources",
    href: "/settings/connections",
  },
  {
    id: "ask-gideon",
    label: "Ask Gideon",
    description: "Ask across what Guardian already knows",
    href: "/ask",
  },
] as const;
