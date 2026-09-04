export type { ArtifactIdentity, ArtifactSourceType, ArtifactSensitivity, ArtifactChunkRef, RetrievedArtifactGroup, EmailThreadExtraction, GroundingDebugSnapshot, ContextPriorityLevel } from "./types";
export { ARTIFACT_SOURCE_TYPES, CONTEXT_PRIORITY } from "./types";
export { hashArtifactContent, createArtifactIdentity, createCurrentInputArtifact } from "./identity";
export { classifySourceType, looksLikeEmailThread, looksLikeSingleEmail } from "./classify";
export {
  extractEmailThread,
  formatEmailThreadSemantics,
  detectTimeAmbiguities,
} from "./emailThread";
export {
  classifyArtifactSensitivity,
  isSensitiveArtifact,
} from "./sensitivity";
export {
  scoreArtifactRelevance,
  distinctiveTokens,
  HISTORICAL_RELEVANCE_THRESHOLD,
  SENSITIVE_EXPLICIT_RELEVANCE_THRESHOLD,
  isExplicitlyRelevantToQuery,
  sameThreadOrLinked,
} from "./relevance";
export {
  applyRetrievalGuard,
  type GuardableChunk,
  type RetrievalGuardResult,
} from "./retrievalGuard";
export {
  validateArtifactsForResponse,
  buildGroundingDebugSnapshot,
  formatWhyGideonUsedContext,
} from "./evidenceValidation";
export {
  contextPrioritySystemNote,
  currentArtifactBlock,
} from "./contextPriority";
export {
  formatGroupedArtifactContext,
  formatChunksGroupedByDocument,
} from "./formatGroupedContext";
export {
  answerClaimsAttachmentView,
  mayClaimAttachmentView,
  evidenceClaimSystemNote,
} from "./claims";
