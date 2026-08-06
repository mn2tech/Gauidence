/** Guardian Knowledge Engine Phase 2 feature flag. */
export function isKnowledgeEngineV2Enabled(): boolean {
  return process.env.GUARDIAN_KNOWLEDGE_ENGINE_V2_ENABLED === "true";
}

export const KNOWLEDGE_EXTRACTION_VERSION = "v2";

export function knowledgeAutoSaveThreshold(): number {
  const raw = process.env.GUARDIAN_KNOWLEDGE_AUTO_SAVE_THRESHOLD;
  const parsed = raw ? Number.parseFloat(raw) : 0.9;
  return Number.isFinite(parsed) ? parsed : 0.9;
}

export function knowledgeSuggestThreshold(): number {
  const raw = process.env.GUARDIAN_KNOWLEDGE_SUGGEST_THRESHOLD;
  const parsed = raw ? Number.parseFloat(raw) : 0.7;
  return Number.isFinite(parsed) ? parsed : 0.7;
}

export function isKnowledgeDiagnosticsEnabled(): boolean {
  if (process.env.GUARDIAN_KNOWLEDGE_DIAGNOSTICS === "true") return true;
  return process.env.NODE_ENV === "development";
}
