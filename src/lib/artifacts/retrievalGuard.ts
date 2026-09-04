import { createArtifactIdentity } from "./identity";
import { classifySourceType } from "./classify";
import { classifyArtifactSensitivity } from "./sensitivity";
import {
  HISTORICAL_RELEVANCE_THRESHOLD,
  isExplicitlyRelevantToQuery,
  scoreArtifactRelevance,
  SENSITIVE_EXPLICIT_RELEVANCE_THRESHOLD,
  sameThreadOrLinked,
} from "./relevance";
import type {
  ArtifactChunkRef,
  ArtifactIdentity,
  ArtifactSourceType,
  RetrievedArtifactGroup,
} from "./types";

export type GuardableChunk = {
  id: string;
  document_id: string;
  file_name: string;
  content: string;
  chunk_index: number;
  similarity: number;
  profile_id?: string;
  profile_name?: string;
  vector_rank?: number | null;
  keyword_rank?: number | null;
  fusion_score?: number;
  match_source?: string;
  /** Optional pre-classified fields from index metadata. */
  source_type?: ArtifactSourceType;
  document_type?: string | null;
  sensitivity?: ArtifactIdentity["sensitivity"];
};

export type RetrievalGuardResult = {
  includedChunks: GuardableChunk[];
  groups: RetrievedArtifactGroup[];
  currentArtifact: ArtifactIdentity | null;
  evidenceRulesApplied: string[];
};

/**
 * When analyzing a current artifact, keep it at highest weight and only admit
 * historical retrieval that clears a relevance threshold.
 * Sensitive historical artifacts require explicit relevance.
 */
export function applyRetrievalGuard(args: {
  currentArtifact: ArtifactIdentity | null;
  currentContent: string;
  userQuery: string;
  chunks: GuardableChunk[];
  /** When true, historical retrieval is optional support only. */
  analyzingCurrentArtifact: boolean;
  historicalThreshold?: number;
  sensitiveThreshold?: number;
}): RetrievalGuardResult {
  const evidenceRulesApplied: string[] = [
    "context_priority_current_input_first",
    "no_source_no_claim",
  ];
  const historicalThreshold =
    args.historicalThreshold ?? HISTORICAL_RELEVANCE_THRESHOLD;
  const sensitiveThreshold =
    args.sensitiveThreshold ?? SENSITIVE_EXPLICIT_RELEVANCE_THRESHOLD;

  if (!args.analyzingCurrentArtifact || !args.currentArtifact) {
    const groups = groupChunksByArtifact(args.chunks, {
      currentArtifactId: null,
      userQuery: args.userQuery,
      currentContent: args.currentContent,
      includeAll: true,
    });
    return {
      includedChunks: args.chunks,
      groups,
      currentArtifact: args.currentArtifact,
      evidenceRulesApplied,
    };
  }

  evidenceRulesApplied.push("current_artifact_weight_highest");
  evidenceRulesApplied.push("historical_relevance_threshold");
  evidenceRulesApplied.push("sensitive_document_isolation");

  const currentId = args.currentArtifact.artifactId;
  const included: GuardableChunk[] = [];
  const groups: RetrievedArtifactGroup[] = [];

  const byDoc = new Map<string, GuardableChunk[]>();
  for (const chunk of args.chunks) {
    const list = byDoc.get(chunk.document_id) ?? [];
    list.push(chunk);
    byDoc.set(chunk.document_id, list);
  }

  for (const [docId, docChunks] of byDoc) {
    const sample = docChunks.map((c) => c.content).join("\n").slice(0, 6000);
    const fileName = docChunks[0]?.file_name ?? "unknown";
    const sourceType =
      docChunks[0]?.source_type ??
      classifySourceType({
        content: sample,
        fileName,
        documentType: docChunks[0]?.document_type,
      });
    const sensitivity =
      docChunks[0]?.sensitivity ??
      classifyArtifactSensitivity({
        sourceType,
        content: sample,
        fileName,
        documentType: docChunks[0]?.document_type,
      });

    const artifact = createArtifactIdentity({
      artifactId: docId,
      spaceId: docChunks[0]?.profile_id ?? args.currentArtifact.spaceId,
      content: sample,
      sourceName: fileName,
      sourceType,
      sensitivity,
      documentType: docChunks[0]?.document_type,
    });

    const maxFusion = Math.max(
      ...docChunks.map((c) => c.fusion_score ?? c.similarity ?? 0),
      0
    );
    const relevance = scoreArtifactRelevance({
      current: {
        content: args.currentContent,
        sourceType: args.currentArtifact.sourceType,
        sourceName: args.currentArtifact.sourceName,
      },
      candidate: {
        content: sample,
        sourceType,
        sourceName: fileName,
        fusionScore: maxFusion,
      },
      userQuery: args.userQuery,
    });

    const refs: ArtifactChunkRef[] = docChunks.map((c) => ({
      chunkId: c.id,
      artifactId: docId,
      spaceId: c.profile_id ?? null,
      sourceType,
      sourceName: fileName,
      relevanceScore: relevance,
      content: c.content,
      sensitivity,
      fusionScore: c.fusion_score,
      vectorRank: c.vector_rank,
      keywordRank: c.keyword_rank,
    }));

    const isCurrent = docId === currentId || sameThreadOrLinked(args.currentArtifact, artifact);
    let includedFlag = false;
    let reasonRetrieved = "";
    let exclusionReason: string | undefined;

    if (isCurrent) {
      includedFlag = true;
      reasonRetrieved = "current_artifact";
    } else if (sensitivity === "high") {
      const explicit = isExplicitlyRelevantToQuery({
        candidateContent: sample,
        candidateName: fileName,
        userQuery: args.userQuery,
        currentContent: args.currentContent,
      });
      if (explicit && relevance >= sensitiveThreshold) {
        includedFlag = true;
        reasonRetrieved = "sensitive_but_explicitly_relevant";
        evidenceRulesApplied.push("sensitive_explicit_relevance_pass");
      } else {
        includedFlag = false;
        exclusionReason =
          "sensitive_unrelated_rejected — high-sensitivity artifact without explicit relevance";
        evidenceRulesApplied.push("sensitive_unrelated_rejected");
      }
    } else if (relevance >= historicalThreshold) {
      includedFlag = true;
      reasonRetrieved = `historical_relevant score=${relevance.toFixed(3)}`;
    } else {
      includedFlag = false;
      exclusionReason = `below_relevance_threshold score=${relevance.toFixed(3)} < ${historicalThreshold}`;
    }

    groups.push({
      artifact,
      chunks: refs,
      maxRelevance: relevance,
      included: includedFlag,
      reasonRetrieved: reasonRetrieved || "excluded",
      exclusionReason,
    });

    if (includedFlag) {
      included.push(...docChunks);
    }
  }

  // Always prefer current artifact chunks first
  included.sort((a, b) => {
    const aCur = a.document_id === currentId ? 0 : 1;
    const bCur = b.document_id === currentId ? 0 : 1;
    return aCur - bCur;
  });

  return {
    includedChunks: included,
    groups,
    currentArtifact: args.currentArtifact,
    evidenceRulesApplied: [...new Set(evidenceRulesApplied)],
  };
}

function groupChunksByArtifact(
  chunks: GuardableChunk[],
  opts: {
    currentArtifactId: string | null;
    userQuery: string;
    currentContent: string;
    includeAll: boolean;
  }
): RetrievedArtifactGroup[] {
  const byDoc = new Map<string, GuardableChunk[]>();
  for (const chunk of chunks) {
    const list = byDoc.get(chunk.document_id) ?? [];
    list.push(chunk);
    byDoc.set(chunk.document_id, list);
  }
  const groups: RetrievedArtifactGroup[] = [];
  for (const [docId, docChunks] of byDoc) {
    const sample = docChunks.map((c) => c.content).join("\n").slice(0, 4000);
    const fileName = docChunks[0]?.file_name ?? "unknown";
    const sourceType = classifySourceType({ content: sample, fileName });
    const sensitivity = classifyArtifactSensitivity({
      sourceType,
      content: sample,
      fileName,
    });
    const artifact = createArtifactIdentity({
      artifactId: docId,
      spaceId: docChunks[0]?.profile_id ?? null,
      content: sample,
      sourceName: fileName,
      sourceType,
      sensitivity,
    });
    const relevance = scoreArtifactRelevance({
      current: { content: opts.currentContent || opts.userQuery },
      candidate: {
        content: sample,
        sourceName: fileName,
        fusionScore: Math.max(
          ...docChunks.map((c) => c.fusion_score ?? c.similarity ?? 0),
          0
        ),
      },
      userQuery: opts.userQuery,
    });
    groups.push({
      artifact,
      chunks: docChunks.map((c) => ({
        chunkId: c.id,
        artifactId: docId,
        spaceId: c.profile_id ?? null,
        sourceType,
        sourceName: fileName,
        relevanceScore: relevance,
        content: c.content,
        sensitivity,
      })),
      maxRelevance: relevance,
      included: opts.includeAll,
      reasonRetrieved: opts.includeAll
        ? "retrieved_without_current_artifact_guard"
        : "ungrouped",
    });
  }
  return groups;
}
