import type {
  KnowledgeConfidenceLevel,
  PersonalFactStatus,
} from "./types";

/** Map numeric confidence to high / medium / low bands. */
export function confidenceLevelFromScore(
  confidence: number
): KnowledgeConfidenceLevel {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.55) return "medium";
  return "low";
}

/** Status to apply when persisting a candidate. */
export function statusForConfidence(
  level: KnowledgeConfidenceLevel
): PersonalFactStatus | "ask" {
  if (level === "high") return "confirmed";
  if (level === "medium") return "provisional";
  return "ask";
}

const UNCERTAIN_MARKERS =
  /\b(i think|i believe|maybe|might be|may be|possibly|not sure|probably|guess|around|approximately|i'm not sure|im not sure)\b/i;

/** Detect hedging / uncertainty in user phrasing. */
export function hasUncertaintyMarkers(text: string): boolean {
  return UNCERTAIN_MARKERS.test(text);
}

/**
 * Adjust confidence when the user hedges.
 * Uncertain phrasing must not become a confirmed fact.
 */
export function applyUncertainty(
  baseConfidence: number,
  sourceText: string
): { confidence: number; level: KnowledgeConfidenceLevel; mustAsk: boolean } {
  if (!hasUncertaintyMarkers(sourceText)) {
    const level = confidenceLevelFromScore(baseConfidence);
    return {
      confidence: baseConfidence,
      level,
      mustAsk: level === "low",
    };
  }
  const lowered = Math.min(baseConfidence, 0.5);
  return {
    confidence: lowered,
    level: "low",
    mustAsk: true,
  };
}

export function shouldAutoStore(level: KnowledgeConfidenceLevel): boolean {
  return level === "high";
}

export function shouldAskConfirmation(
  level: KnowledgeConfidenceLevel,
  mustAsk?: boolean
): boolean {
  return Boolean(mustAsk) || level === "low" || level === "medium";
}
