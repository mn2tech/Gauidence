/**
 * Development/admin observability for Gideon Business Intelligence.
 * Stores structured decisions only — never chain-of-thought.
 */

import type { BusinessBiObservability, BusinessQueryPlan } from "./types";

export function buildBiObservability(args: {
  question: string;
  plan: BusinessQueryPlan;
  ontologyHitCount?: number;
  structuredHitCount?: number;
  evidenceSelected?: number;
  claimsGenerated?: number;
  filteredSystemMetadata?: number;
}): BusinessBiObservability {
  return {
    question: args.question.slice(0, 500),
    intent: args.plan.intent,
    entities: args.plan.entities,
    strategy: args.plan.strategy,
    ontologyHitCount: args.ontologyHitCount ?? 0,
    structuredHitCount: args.structuredHitCount ?? 0,
    evidenceSelected: args.evidenceSelected ?? 0,
    claimsGenerated: args.claimsGenerated ?? 0,
    filteredSystemMetadata: args.filteredSystemMetadata ?? 0,
  };
}

export function logBusinessIntelligenceTrace(
  obs: BusinessBiObservability,
  extras?: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === "production" && process.env.GIDEON_BI_DEBUG !== "1") {
    return;
  }
  console.info(
    "[gideon-bi]",
    JSON.stringify({
      question: obs.question,
      intent: obs.intent,
      entities: obs.entities,
      strategy: obs.strategy,
      ontologyHitCount: obs.ontologyHitCount,
      structuredHitCount: obs.structuredHitCount,
      evidenceSelected: obs.evidenceSelected,
      claimsGenerated: obs.claimsGenerated,
      filteredSystemMetadata: obs.filteredSystemMetadata,
      ...extras,
    })
  );
}
