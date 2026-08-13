import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  retrieveVaultChunks,
  retrieveVaultChunksMulti,
} from "./indexDocument";
import type { RetrievedChunk } from "./retrieve";
import type { LinkedVaultProfile } from "./rollup";

export const HYBRID_VECTOR_TOP_K = 20;
export const HYBRID_KEYWORD_TOP_K = 20;
export const HYBRID_FINAL_TOP_K = 12;
export const RRF_K = 60;

/** Identifier-like tokens (invoice numbers, codes) get a ranking boost after fusion. */
const IDENTIFIER_PATTERN =
  /\b(?:inv(?:oice)?[-#:]?\s*)?[\w-]*\d{3,}[\w-]*\b|\b[A-Z]{2,}\d{2,}\b/gi;

export type KeywordChunk = {
  id: string;
  document_id: string;
  profile_id: string;
  file_name: string;
  content: string;
  chunk_index: number;
  keyword_score: number;
  match_source: string;
};

export type HybridRetrievalResult = RetrievedChunk & {
  vector_rank: number | null;
  keyword_rank: number | null;
  fusion_score: number;
  match_source?: string;
  metadata: {
    vectorSimilarity?: number;
    keywordScore?: number;
    matchSource?: string;
  };
};

export type FuseRankedArgs = {
  vectorResults: RetrievedChunk[];
  keywordResults: KeywordChunk[];
  query: string;
  profileNames: Record<string, string>;
  finalTopK?: number;
};

/**
 * Reciprocal Rank Fusion with optional boost for exact identifier matches.
 * score(d) = Σ 1/(k + rank_i(d)) + identifierBoost
 */
export function fuseRankedResults(args: FuseRankedArgs): HybridRetrievalResult[] {
  const {
    vectorResults,
    keywordResults,
    query,
    profileNames,
    finalTopK = HYBRID_FINAL_TOP_K,
  } = args;

  const identifierTokens = extractIdentifierTokens(query);
  const fused = new Map<
    string,
    HybridRetrievalResult & { _identifierHits: number }
  >();

  const upsert = (
    chunkKey: string,
    base: Omit<HybridRetrievalResult, "fusion_score" | "metadata"> & {
      metadata: HybridRetrievalResult["metadata"];
    },
    rrfContribution: number,
    identifierHits: number
  ) => {
    const existing = fused.get(chunkKey);
    if (existing) {
      existing.fusion_score += rrfContribution;
      existing._identifierHits += identifierHits;
      if (base.vector_rank != null) existing.vector_rank = base.vector_rank;
      if (base.keyword_rank != null) existing.keyword_rank = base.keyword_rank;
      if (base.similarity > existing.similarity) {
        existing.similarity = base.similarity;
      }
      if (
        base.metadata.keywordScore != null &&
        (existing.metadata.keywordScore ?? 0) < base.metadata.keywordScore
      ) {
        existing.metadata.keywordScore = base.metadata.keywordScore;
        existing.metadata.matchSource = base.metadata.matchSource;
        existing.match_source = base.match_source;
      }
      return;
    }
    fused.set(chunkKey, {
      ...base,
      fusion_score: rrfContribution,
      _identifierHits: identifierHits,
    });
  };

  vectorResults.forEach((row, index) => {
    const rank = index + 1;
    const profileId = row.profile_id ?? "";
    const chunkKey = row.id;
    const identifierHits = countIdentifierHits(
      identifierTokens,
      row.file_name,
      row.content
    );
    upsert(
      chunkKey,
      {
        ...row,
        profile_id: profileId || row.profile_id,
        profile_name:
          row.profile_name ??
          (profileId ? profileNames[profileId] : undefined),
        vector_rank: rank,
        keyword_rank: null,
        similarity: row.similarity,
        metadata: { vectorSimilarity: row.similarity },
      },
      1 / (RRF_K + rank),
      identifierHits
    );
  });

  keywordResults.forEach((row, index) => {
    const rank = index + 1;
    const chunkKey = row.id;
    const identifierHits = countIdentifierHits(
      identifierTokens,
      row.file_name,
      row.content
    );
    upsert(
      chunkKey,
      {
        id: row.id,
        document_id: row.document_id,
        profile_id: row.profile_id,
        file_name: row.file_name,
        content: row.content,
        chunk_index: row.chunk_index,
        similarity: row.keyword_score,
        profile_name: profileNames[row.profile_id],
        vector_rank: null,
        keyword_rank: rank,
        match_source: row.match_source,
        metadata: {
          keywordScore: row.keyword_score,
          matchSource: row.match_source,
        },
      },
      1 / (RRF_K + rank),
      identifierHits
    );
  });

  const ranked = [...fused.values()]
    .map(({ _identifierHits, ...row }) => ({
      ...row,
      fusion_score:
        row.fusion_score + (_identifierHits > 0 ? 0.15 * _identifierHits : 0),
      similarity: row.fusion_score,
    }))
    .sort((a, b) => {
      if (b.fusion_score !== a.fusion_score) {
        return b.fusion_score - a.fusion_score;
      }
      const aVec = a.vector_rank ?? 999;
      const bVec = b.vector_rank ?? 999;
      return aVec - bVec;
    })
    .slice(0, finalTopK);

  return ranked.map((row) => ({
    ...row,
    similarity: row.fusion_score,
  }));
}

function extractIdentifierTokens(query: string): string[] {
  const matches = query.match(IDENTIFIER_PATTERN) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase().trim()))].filter(
    (t) => t.length >= 3
  );
}

function countIdentifierHits(
  tokens: string[],
  fileName: string,
  content: string
): number {
  if (tokens.length === 0) return 0;
  const haystack = `${fileName} ${content}`.toLowerCase();
  return tokens.filter((t) => haystack.includes(t)).length;
}

export async function searchKeywordChunks(
  supabase: SupabaseClient,
  query: string,
  profileIds: string[],
  matchCount = HYBRID_KEYWORD_TOP_K
): Promise<KeywordChunk[]> {
  if (profileIds.length === 0 || !query.trim()) return [];

  const { data, error } = await supabase.rpc("search_document_chunks_keyword", {
    search_query: query,
    filter_profile_ids: profileIds,
    match_count: matchCount,
  });

  if (error) {
    const msg = error.message ?? "";
    if (
      error.code === "42883" ||
      /search_document_chunks_keyword/i.test(msg) ||
      /does not exist/i.test(msg)
    ) {
      return [];
    }
    // Large vaults can trip statement_timeout on keyword FTS — fall back to vector.
    if (
      error.code === "57014" ||
      /statement timeout|canceling statement/i.test(msg)
    ) {
      console.warn(
        "Keyword vault retrieval timed out; continuing with vector-only results."
      );
      return [];
    }
    throw new Error(`Keyword vault retrieval failed: ${error.message}`);
  }

  return (data ?? []) as KeywordChunk[];
}

export async function retrieveVectorCandidates(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  scopes: LinkedVaultProfile[],
  matchCount = HYBRID_VECTOR_TOP_K
): Promise<RetrievedChunk[]> {
  if (scopes.length === 0) return [];

  const profileNames = Object.fromEntries(
    scopes.map((s) => [s.id, s.display_name])
  );
  const profileIds = scopes.map((s) => s.id);

  if (scopes.length === 1) {
    const rows = await retrieveVaultChunks(
      supabase,
      queryEmbedding,
      scopes[0].id,
      matchCount
    );
    return rows.map((row) => ({
      ...row,
      profile_id: scopes[0].id,
      profile_name: scopes[0].display_name,
    }));
  }

  const multi = await retrieveVaultChunksMulti(
    supabase,
    queryEmbedding,
    profileIds,
    matchCount
  );
  if (multi !== null) {
    return multi.map((row) => ({
      ...row,
      profile_name:
        row.profile_name ??
        (row.profile_id ? profileNames[row.profile_id] : undefined),
    }));
  }

  const perProfile = Math.max(3, Math.ceil(matchCount / Math.min(scopes.length, 4)));
  const batches = await Promise.all(
    scopes.map(async (scope) => {
      try {
        const rows = await retrieveVaultChunks(
          supabase,
          queryEmbedding,
          scope.id,
          perProfile
        );
        return rows.map((row) => ({
          ...row,
          profile_id: scope.id,
          profile_name: scope.display_name,
        }));
      } catch {
        return [] as RetrievedChunk[];
      }
    })
  );

  return batches
    .flat()
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, matchCount);
}

export type HybridRetrieveArgs = {
  supabase: SupabaseClient;
  query: string;
  queryEmbedding: number[];
  scopes: LinkedVaultProfile[];
  finalTopK?: number;
};

export async function hybridRetrieveVaultChunks(
  args: HybridRetrieveArgs
): Promise<{
  results: HybridRetrievalResult[];
  vectorCount: number;
  keywordCount: number;
  mergedCount: number;
}> {
  const profileIds = args.scopes.map((s) => s.id);
  const profileNames = Object.fromEntries(
    args.scopes.map((s) => [s.id, s.display_name])
  );

  const [vectorResults, keywordResults] = await Promise.all([
    retrieveVectorCandidates(
      args.supabase,
      args.queryEmbedding,
      args.scopes,
      HYBRID_VECTOR_TOP_K
    ),
    searchKeywordChunks(
      args.supabase,
      args.query,
      profileIds,
      HYBRID_KEYWORD_TOP_K
    ),
  ]);

  const results = fuseRankedResults({
    vectorResults,
    keywordResults,
    query: args.query,
    profileNames,
    finalTopK: args.finalTopK ?? HYBRID_FINAL_TOP_K,
  });

  const mergedCount = new Set([
    ...vectorResults.map((r) => r.id),
    ...keywordResults.map((r) => r.id),
  ]).size;

  return {
    results,
    vectorCount: vectorResults.length,
    keywordCount: keywordResults.length,
    mergedCount,
  };
}
