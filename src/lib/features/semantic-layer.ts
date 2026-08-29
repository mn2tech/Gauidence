/** Guardian Semantic Layer Phase 1 feature flag. */
export function isGuardianSemanticLayerEnabled(): boolean {
  return process.env.GUARDIAN_SEMANTIC_LAYER_ENABLED === "true";
}

export const SEMANTIC_EXTRACTION_VERSION = "v1";

export function isSemanticDiagnosticsEnabled(): boolean {
  if (process.env.GUARDIAN_SEMANTIC_DIAGNOSTICS === "true") return true;
  return process.env.NODE_ENV === "development";
}

/** Minimum confidence to persist extracted assertions. */
export function semanticConfidenceThreshold(): number {
  const raw = process.env.GUARDIAN_SEMANTIC_CONFIDENCE_THRESHOLD;
  const parsed = raw ? Number.parseFloat(raw) : 0.75;
  return Number.isFinite(parsed) ? parsed : 0.75;
}

/** Minimum confidence for fuzzy entity matching. */
export function semanticFuzzyMatchThreshold(): number {
  const raw = process.env.GUARDIAN_SEMANTIC_FUZZY_THRESHOLD;
  const parsed = raw ? Number.parseFloat(raw) : 0.92;
  return Number.isFinite(parsed) ? parsed : 0.92;
}

/** Days ahead for upcoming-deadline Watch rule. */
export function semanticDeadlineHorizonDays(): number {
  const raw = process.env.GUARDIAN_SEMANTIC_DEADLINE_HORIZON_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : 14;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

/** Days without interaction before follow-up rule may fire (conservative). */
export function semanticFollowUpQuietDays(): number {
  const raw = process.env.GUARDIAN_SEMANTIC_FOLLOWUP_QUIET_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : 45;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45;
}
