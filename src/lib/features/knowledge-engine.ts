/** Guardian Knowledge Engine feature flag — defaults to disabled. */
export function isKnowledgeEngineEnabled(): boolean {
  return process.env.GUARDIAN_KNOWLEDGE_ENGINE_ENABLED === "true";
}
