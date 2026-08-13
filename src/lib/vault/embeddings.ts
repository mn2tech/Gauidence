import "server-only";

import OpenAI from "openai";
import {
  getCachedEmbedding,
  hashEmbeddingCacheKey,
  setCachedEmbedding,
} from "./embeddingCache";

export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export const EMBEDDING_DIMENSIONS = 1536;

export function isVaultEmbeddingConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  // Reject empty / placeholder values (e.g. `""` pulled from Vercel).
  return key.length >= 20 && key.startsWith("sk-");
}

function createEmbeddingClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for vault embeddings.");
  }
  return new OpenAI({ apiKey });
}

/** Embed one or many texts with OpenAI text-embedding-3-small. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = createEmbeddingClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 7000)),
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((row) => row.embedding);
}

export async function embedQuery(query: string): Promise<number[]> {
  const cacheKey = hashEmbeddingCacheKey(query);
  const cached = getCachedEmbedding(cacheKey);
  if (cached) return cached;

  const [vec] = await embedTexts([query]);
  if (!vec) throw new Error("Empty embedding response.");
  setCachedEmbedding(cacheKey, vec);
  return vec;
}
