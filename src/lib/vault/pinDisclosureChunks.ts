import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RetrievedChunk } from "@/lib/vault/retrieve";
import {
  isDocumentContentQuestion,
  isRegulatoryDisclosureFileName,
} from "@/lib/gideon/documentGrounding";

type DisclosureDoc = {
  id: string;
  profile_id: string;
  file_name: string;
};

function buildAnalysisChunkContent(args: {
  fileName: string;
  title?: string | null;
  summary?: string | null;
  facts?: { label?: string; value?: string }[] | null;
}): string {
  const lines = [
    `Document: ${args.fileName}`,
    "Source: Guardian analysis summary (authoritative for fees/services when present)",
  ];
  if (args.title?.trim()) lines.push(`Title: ${args.title.trim()}`);
  if (args.summary?.trim()) {
    lines.push("", "Summary:", args.summary.trim());
  }
  const facts = Array.isArray(args.facts) ? args.facts : [];
  if (facts.length) {
    lines.push("", "Facts:");
    for (const f of facts.slice(0, 40)) {
      const label = String(f.label ?? "Fact").trim();
      const value = String(f.value ?? "").trim();
      if (!value) continue;
      lines.push(`- ${label}: ${value}`);
    }
  }
  return lines.join("\n").trim();
}

async function findDisclosureDocuments(
  supabase: SupabaseClient,
  profileIds: string[]
): Promise<DisclosureDoc[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, profile_id, file_name")
    .in("profile_id", profileIds)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error || !data?.length) return [];

  return data
    .filter((row) => isRegulatoryDisclosureFileName(String(row.file_name ?? "")))
    .map((row) => ({
      id: String(row.id),
      profile_id: String(row.profile_id),
      file_name: String(row.file_name ?? "document"),
    }));
}

/**
 * Pin Form ADV / CRS analysis + chunks for fee/service questions.
 * Looks up disclosure documents first (not a random chunk sample), then
 * injects analysis summaries so fee tiers survive even when vector search
 * prefers marketing website pages.
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

  const limit = Math.min(Math.max(args.limit ?? 8, 1), 12);
  const docs = await findDisclosureDocuments(supabase, args.profileIds);
  if (!docs.length) return [];

  const docIds = docs.map((d) => d.id);
  const docById = new Map(docs.map((d) => [d.id, d]));

  const [{ data: analysisRows }, { data: chunkRows }] = await Promise.all([
    supabase
      .from("extracted_data")
      .select("document_id, title, summary, facts")
      .in("document_id", docIds),
    supabase
      .from("document_chunks")
      .select("id, document_id, profile_id, file_name, content, chunk_index")
      .in("document_id", docIds)
      .order("chunk_index", { ascending: true })
      .limit(60),
  ]);

  const out: RetrievedChunk[] = [];

  for (const row of analysisRows ?? []) {
    const docId = String(row.document_id ?? "");
    const doc = docById.get(docId);
    if (!doc) continue;
    const content = buildAnalysisChunkContent({
      fileName: doc.file_name,
      title: typeof row.title === "string" ? row.title : null,
      summary: typeof row.summary === "string" ? row.summary : null,
      facts: Array.isArray(row.facts)
        ? (row.facts as { label?: string; value?: string }[])
        : null,
    });
    if (content.length < 40) continue;
    out.push({
      id: `analysis:${docId}`,
      document_id: docId,
      profile_id: doc.profile_id,
      file_name: doc.file_name,
      content,
      chunk_index: -1,
      similarity: 1,
    });
  }

  const scored = (chunkRows ?? []).map((row) => {
    const content = String(row.content ?? "");
    const lower = content.toLowerCase();
    let score = 0;
    if (/\b(fee|fees|compensation|0\.\d+%|item\s*5|minimum)\b/i.test(lower)) {
      score += 5;
    }
    if (/\b(service|advisory|portfolio|financial planning)\b/i.test(lower)) {
      score += 2;
    }
    if (Number(row.chunk_index ?? 0) === 0) score += 1;
    return { row, score };
  });
  scored.sort(
    (a, b) => b.score - a.score || Number(a.row.chunk_index) - Number(b.row.chunk_index)
  );

  for (const { row } of scored) {
    if (out.length >= limit) break;
    const docId = String(row.document_id);
    out.push({
      id: String(row.id),
      document_id: docId,
      profile_id: String(row.profile_id),
      file_name: String(row.file_name ?? docById.get(docId)?.file_name ?? "document"),
      content: String(row.content ?? ""),
      chunk_index: Number(row.chunk_index ?? 0),
      similarity: 0.99,
    });
  }

  return out.slice(0, limit);
}
