/**
 * Orchestration observability — development / admin / Test Lab only.
 * Never attach to ordinary user-facing chat responses.
 */

import type { GideonOrchestrationRoute } from "./request-router";
import type {
  GuardianKnowledgeResult,
  OrchestrationDebugSnapshot,
} from "./orchestration-types";

export function buildOrchestrationDebugSnapshot(args: {
  route: GideonOrchestrationRoute;
  knowledge?: GuardianKnowledgeResult | null;
  spaceName?: string;
  includeReasoning?: boolean;
}): OrchestrationDebugSnapshot {
  const { route, knowledge } = args;
  return {
    intent: route.intent,
    responseDepth: route.responseDepth,
    space: args.spaceName ?? knowledge?.spaceName,
    knowledgeStatus: knowledge?.status,
    guardianKnowledgeRequired: route.guardianKnowledgeRequired,
    generalKnowledgeAllowed: route.generalKnowledgeAllowed,
    knowledgeSource: route.knowledgeSource,
    retrievedEvidenceCount: knowledge?.retrievalEvidence.length ?? 0,
    ontologyEntityCount: knowledge?.entities.length ?? 0,
    confidence: knowledge?.confidence ?? route.confidence,
    reasoning: args.includeReasoning ? route.reasoning : undefined,
  };
}

/** True when orchestration debug may be returned (admin Test Lab / NODE_ENV). */
export function shouldExposeOrchestrationDebug(opts?: {
  isAdmin?: boolean;
  testLab?: boolean;
}): boolean {
  if (opts?.testLab) return true;
  if (opts?.isAdmin && process.env.NODE_ENV !== "production") return true;
  return false;
}
