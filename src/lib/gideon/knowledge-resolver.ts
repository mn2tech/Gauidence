/**
 * Unified Guardian knowledge resolver.
 * Normalizes retrieval + ontology into a single result for Gideon to reason over.
 * Core helpers are pure (fixture-safe). Live DB loading stays in workspace-context.
 */

import { budgetRetrievalEvidence, MAX_DIRECT_EVIDENCE } from "./evidence-budget";
import type {
  GuardianCommitmentRef,
  GuardianEventRef,
  GuardianFact,
  GuardianKnowledgeResult,
  KnowledgeStatus,
  OntologyEntityRef,
  OntologyRelationshipRef,
  RetrievalEvidence,
} from "./orchestration-types";

export type ResolveGuardianKnowledgeInput = {
  query: string;
  userId: string;
  spaceId?: string;
  conversationId?: string;
  /** Prefetched / fixture layers — when provided, no I/O is performed. */
  layers?: {
    directFacts?: GuardianFact[];
    retrievalEvidence?: RetrievalEvidence[];
    entities?: OntologyEntityRef[];
    relationships?: OntologyRelationshipRef[];
    events?: GuardianEventRef[];
    commitments?: GuardianCommitmentRef[];
    spaceName?: string;
  };
};

export { MAX_DIRECT_EVIDENCE };

function scoreConfidence(args: {
  facts: number;
  evidence: number;
  entities: number;
  relationships: number;
}): number {
  const raw =
    Math.min(args.facts, 3) * 0.22 +
    Math.min(args.evidence, 5) * 0.1 +
    Math.min(args.entities, 4) * 0.08 +
    Math.min(args.relationships, 4) * 0.05;
  return Math.max(0, Math.min(1, raw));
}

export function classifyKnowledgeStatus(args: {
  facts: GuardianFact[];
  evidence: RetrievalEvidence[];
  entities: OntologyEntityRef[];
  relationships: OntologyRelationshipRef[];
  events?: GuardianEventRef[];
  commitments?: GuardianCommitmentRef[];
}): KnowledgeStatus {
  const strongFacts = args.facts.filter((f) => f.confidence >= 0.55);
  const strongEvidence = args.evidence.filter((e) => e.score >= 0.25);
  const hasStructure =
    args.entities.length > 0 ||
    args.relationships.length > 0 ||
    (args.events?.length ?? 0) > 0 ||
    (args.commitments?.length ?? 0) > 0;

  if (strongFacts.length > 0 || strongEvidence.length >= 2) return "known";
  if (
    strongEvidence.length === 1 &&
    strongFacts.length === 0 &&
    !hasStructure
  ) {
    return "partially_known";
  }
  if (
    strongFacts.length === 0 &&
    strongEvidence.length === 0 &&
    !hasStructure
  ) {
    return "unknown";
  }
  if (strongFacts.length > 0 || (strongEvidence.length > 0 && hasStructure)) {
    return "known";
  }
  if (strongEvidence.length > 0 || hasStructure) return "partially_known";
  return "unknown";
}

/**
 * Resolve Guardian knowledge from provided layers (tests / orchestration).
 * Live vault-chat continues to use loadWorkspaceContext; this normalizes
 * whatever evidence those systems already produced.
 */
export function resolveGuardianKnowledge(
  input: ResolveGuardianKnowledgeInput
): GuardianKnowledgeResult {
  const layers = input.layers ?? {};
  const retrievalEvidence = budgetRetrievalEvidence(
    layers.retrievalEvidence ?? [],
    MAX_DIRECT_EVIDENCE
  );
  const directFacts = layers.directFacts ?? [];
  const entities = layers.entities ?? [];
  const relationships = layers.relationships ?? [];
  const events = layers.events ?? [];
  const commitments = layers.commitments ?? [];

  const status = classifyKnowledgeStatus({
    facts: directFacts,
    evidence: retrievalEvidence,
    entities,
    relationships,
    events,
    commitments,
  });

  const confidence = scoreConfidence({
    facts: directFacts.length,
    evidence: retrievalEvidence.length,
    entities: entities.length,
    relationships: relationships.length,
  });

  return {
    status,
    directFacts,
    retrievalEvidence,
    entities,
    relationships,
    events,
    commitments,
    confidence,
    spaceId: input.spaceId,
    spaceName: layers.spaceName,
  };
}

/** Build a concise "Guardian does not know" reply for unknown world facts. */
export function unknownGuardianWorldAnswer(args: {
  subject?: string;
  topic?: string;
  spaceName?: string;
  suggestUpload?: boolean;
}): string {
  const subject = args.subject?.trim();
  const topic = args.topic?.trim() || "that information";
  const space = args.spaceName?.trim();

  let line: string;
  if (subject) {
    line = `I don't have ${subject}'s ${topic} in its Space yet.`;
  } else if (space) {
    line = `I don't have ${topic} in the ${space} Space yet.`;
  } else {
    line = `I don't have ${topic} in Guardian yet.`;
  }

  if (args.suggestUpload !== false) {
    line +=
      " If you upload a document or connect a source that contains it, I can add it to the Space knowledge.";
  }
  return line;
}
