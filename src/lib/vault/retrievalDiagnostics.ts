import "server-only";

import { createHash } from "node:crypto";
import type { EmbeddingCacheStats } from "./embeddingCache";

export type RetrievalDiagnostics = {
  searchScope: string;
  profileIds: string[];
  queryHash: string;
  vectorCandidateCount: number;
  keywordCandidateCount: number;
  mergedCandidateCount: number;
  selectedEvidenceCount: number;
  retrievalDurationMs: number;
  embeddingDurationMs: number;
  contextBuildDurationMs: number;
  embeddingCache: EmbeddingCacheStats;
  knowledgeCandidateCount?: number;
};

export function isRetrievalDiagnosticsEnabled(): boolean {
  if (process.env.GUARDIAN_RETRIEVAL_DIAGNOSTICS === "true") return true;
  return process.env.NODE_ENV === "development";
}

export function hashQueryForDiagnostics(query: string): string {
  return createHash("sha256")
    .update(query.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

export function logRetrievalDiagnostics(diag: RetrievalDiagnostics): void {
  if (!isRetrievalDiagnosticsEnabled()) return;
  console.info("gideon_retrieval_diagnostics", JSON.stringify(diag));
}
