/** Guardian Ontology Engine Phase 1 feature flag. */
export function isGuardianOntologyEnabled(): boolean {
  return process.env.GUARDIAN_ONTOLOGY_ENABLED === "true";
}

export const ONTOLOGY_EXTRACTION_VERSION = "v1";

export function isOntologyDiagnosticsEnabled(): boolean {
  if (process.env.GUARDIAN_ONTOLOGY_DIAGNOSTICS === "true") return true;
  return process.env.NODE_ENV === "development";
}

/** Minimum confidence for fuzzy entity matching (organizations). */
export function ontologyFuzzyMatchThreshold(): number {
  const raw = process.env.GUARDIAN_ONTOLOGY_FUZZY_THRESHOLD;
  const parsed = raw ? Number.parseFloat(raw) : 0.92;
  return Number.isFinite(parsed) ? parsed : 0.92;
}
