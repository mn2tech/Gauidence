/**
 * Artifact identity and grounding types.
 * Lower context priority must never replace Priority 0 (current user input).
 */

export const ARTIFACT_SOURCE_TYPES = [
  "email",
  "email_thread",
  "document",
  "image",
  "screenshot",
  "note",
  "pasted_text",
  "spreadsheet",
  "web_page",
  "calendar_event",
  "unknown",
] as const;

export type ArtifactSourceType = (typeof ARTIFACT_SOURCE_TYPES)[number];

export type ArtifactSensitivity = "none" | "low" | "medium" | "high";

/** Explicit context priority — Priority 0 always wins. */
export const CONTEXT_PRIORITY = {
  CURRENT_INPUT: 0,
  LINKED_ARTIFACT: 1,
  SAME_THREAD: 2,
  SPACE_KNOWLEDGE: 3,
  CROSS_SPACE: 4,
  GENERAL_MODEL: 5,
} as const;

export type ContextPriorityLevel =
  (typeof CONTEXT_PRIORITY)[keyof typeof CONTEXT_PRIORITY];

export type ArtifactIdentity = {
  artifactId: string;
  spaceId: string | null;
  sourceType: ArtifactSourceType;
  sourceId: string | null;
  threadId: string | null;
  parentArtifactId: string | null;
  createdAt: string;
  contentHash: string;
  sourceName?: string | null;
  sensitivity: ArtifactSensitivity;
};

export type ArtifactChunkRef = {
  chunkId: string;
  artifactId: string;
  spaceId: string | null;
  sourceType: ArtifactSourceType;
  sourceName: string;
  relevanceScore: number;
  content: string;
  sensitivity: ArtifactSensitivity;
  /** Hybrid / vector diagnostics when available. */
  fusionScore?: number;
  vectorRank?: number | null;
  keywordRank?: number | null;
};

export type RetrievedArtifactGroup = {
  artifact: ArtifactIdentity;
  chunks: ArtifactChunkRef[];
  maxRelevance: number;
  included: boolean;
  reasonRetrieved: string;
  exclusionReason?: string;
};

export type EmailParticipant = {
  name: string;
  email?: string;
  role?: "from" | "to" | "cc" | "bcc" | "mentioned";
};

export type EmailMessage = {
  index: number;
  from?: string;
  to?: string[];
  cc?: string[];
  date?: string;
  subject?: string;
  body: string;
};

export type EmailThreadExtraction = {
  sourceType: "email_thread";
  participants: EmailParticipant[];
  organizations: string[];
  subject?: string;
  dates: string[];
  messages: EmailMessage[];
  questions: string[];
  requests: string[];
  commitments: string[];
  appointments: string[];
  tasks: string[];
  deadlines: string[];
  /** Likely AM/PM ambiguity (e.g. 11:30 PM in a business context). */
  timeAmbiguities: string[];
};

export type GroundingDebugSnapshot = {
  currentArtifact: ArtifactIdentity | null;
  currentArtifactId: string | null;
  detectedSourceType: ArtifactSourceType | null;
  retrievedArtifacts: RetrievedArtifactGroup[];
  finalContextArtifactIds: string[];
  finalContextSummary: string;
  emailThread?: EmailThreadExtraction | null;
  evidenceRulesApplied: string[];
};
