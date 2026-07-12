/**
 * Compatibility re-exports — analysis LLM is Anthropic Claude (see llm.ts).
 * Import from `@/lib/analysis/llm` for new code.
 */
export {
  ANALYSIS_MODEL,
  VISUAL_ANALYSIS_MODEL,
  buildFileContent,
  modelForInputMode,
  runStructuredJson,
  runPlainText,
  createLlmClient,
  createAnalysisClient,
  documentTypeToCategory,
  type FilePayload,
  type UserContext,
  type LlmClient,
  type ContentPart,
} from "./llm";
