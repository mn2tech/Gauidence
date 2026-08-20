import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RetrievedChunk } from "@/lib/vault/retrieve";
import {
  isDocumentContentQuestion,
  isRegulatoryDisclosureFileName,
} from "@/lib/gideon/documentGrounding";

/**
 * Pin Form ADV / CRS / disclosure brochure chunks for fee/service questions
 * so marketing website pages cannot crowd them out of the top-K.
 */
export async function loadRegulatoryDisclosureChunks(
  supabase: SupabaseClient,
  args: {
    question: string;
    profileIds: string[];
    limit?: number;
  }
): Promise<RetrievedChunk[]> {
  if (!isDocumentContentQuestion(args.question)) return [];
  if (!args.profileIds.length) return [];

  const limit = Math.min(Math.max(args.limit ?? 6, 1), 10);
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, profile_id, file_name, content, chunk_index")
    .in("profile_id", args.profileIds)
    .order("chunk_index", { ascending: true })
    .limit(80);

  if (error || !data?.length) return [];

  const preferred = data.filter((row) =>
    isRegulatoryDisclosureFileName(String(row.file_name ?? ""))
  );
  if (!preferred.length) return [];

  // Prefer chunks that actually mention fees / Item 5 / schedule when present.
  const scored = preferred.map((row) => {
    const content = String(row.content ?? "").toLowerCase();
    let score = 0;
    if (/\b(fee|fees|compensation|0\.\d+%|item\s*5|minimum)\b/i.test(content)) {
      score += 5;
    }
    if (/\b(service|advisory|portfolio|financial planning)\b/i.test(content)) {
      score += 2;
    }
    if (row.chunk_index === 0) score += 1;
    return { row, score };
  });
  scored.sort((a, b) => b.score - a.score || a.row.chunk_index - b.row.chunk_index);

  return scored.slice(0, limit).map(({ row }) => ({
    id: String(row.id),
    document_id: String(row.document_id),
    profile_id: String(row.profile_id),
    file_name: String(row.file_name ?? "document"),
    content: String(row.content ?? ""),
    chunk_index: Number(row.chunk_index ?? 0),
    similarity: 0.99,
  }));
}
