import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  expandAskTokens,
  filterPublishedOnly,
  preferredCategoriesForQuestion,
  scoreKnowledgeRelevance,
} from "./pure";
import type { KnowledgeItemRow, RetrievalHit } from "./types";

export { filterPublishedOnly } from "./pure";

function detectSchoolHint(question: string): string | null {
  // Lightweight: look for "at <Name> School" patterns; callers can pass school later.
  const m = question.match(
    /\b(?:at|for|from)\s+([A-Z][A-Za-z0-9 .'&-]{2,60}\s(?:Elementary|Middle|High)\sSchool)\b/
  );
  return m?.[1]?.trim() ?? null;
}

export type RetrievePublishedArgs = {
  admin: SupabaseClient;
  projectId: string;
  question: string;
  schoolHint?: string | null;
  limit?: number;
};

/**
 * Retrieve only published knowledge for a project.
 * Search priority:
 * 1. Published school-specific knowledge
 * 2. Published district knowledge
 * 3. Other published knowledge in this project
 */
export async function retrievePublishedKnowledge(
  args: RetrievePublishedArgs
): Promise<RetrievalHit[]> {
  const { data: items } = await args.admin
    .from("knowledge_items")
    .select("*")
    .eq("project_id", args.projectId)
    .eq("status", "published");

  const published = (items ?? []) as KnowledgeItemRow[];
  if (!published.length) return [];

  const sourceIds = [...new Set(published.map((i) => i.source_id))];
  const { data: sources } = await args.admin
    .from("knowledge_sources")
    .select("id, source_name")
    .in("id", sourceIds);

  const sourceNameById = new Map<string, string>();
  for (const s of sources ?? []) {
    sourceNameById.set(s.id as string, s.source_name as string);
  }

  const tokens = expandAskTokens(args.question);
  const schoolHint = args.schoolHint ?? detectSchoolHint(args.question);
  const preferredCategories = preferredCategoriesForQuestion(args.question);

  // Defense in depth — never surface non-published rows even if the query drifts.
  const onlyPublished = filterPublishedOnly(published) as KnowledgeItemRow[];

  const schoolSpecific = onlyPublished.filter((i) => Boolean(i.school?.trim()));
  const district = onlyPublished.filter((i) => !i.school?.trim());

  const scored: RetrievalHit[] = [];

  function pushPool(pool: KnowledgeItemRow[], boost: number) {
    for (const item of pool) {
      const relevance =
        scoreKnowledgeRelevance({
          title: item.title,
          content: `${item.content}\n${item.evidence_text}\n${item.subcategory ?? ""}`,
          category: item.category,
          school: item.school,
          question: args.question,
          schoolHint,
          preferredCategories,
        }) + boost;
      if (relevance <= 0 && tokens.length > 0) continue;
      scored.push({
        item,
        source_name: sourceNameById.get(item.source_id) ?? "Source",
        relevance,
        publication_status: item.status,
      });
    }
  }

  // Priority order via boosts
  pushPool(schoolSpecific, 3);
  pushPool(district, 1);
  // Remaining already covered; if question tokens empty, include all with base score
  if (!tokens.length) {
    for (const item of onlyPublished) {
      if (scored.some((h) => h.item.id === item.id)) continue;
      scored.push({
        item,
        source_name: sourceNameById.get(item.source_id) ?? "Source",
        relevance: 1,
        publication_status: item.status,
      });
    }
  }

  scored.sort((a, b) => b.relevance - a.relevance);
  const limit = args.limit ?? 12;
  const seen = new Set<string>();
  const out: RetrievalHit[] = [];
  for (const hit of scored) {
    if (seen.has(hit.item.id)) continue;
    seen.add(hit.item.id);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

export function formatHitsForPrompt(hits: RetrievalHit[]): string {
  if (!hits.length) return "";
  return hits
    .map((hit, i) => {
      const item = hit.item;
      return [
        `[${i + 1}] ${item.title}`,
        item.content,
        `Category: ${item.category}`,
        item.school ? `School: ${item.school}` : null,
        `Authority: ${item.authority ?? "Unknown"}`,
        `Source title: ${hit.source_name}`,
        item.source_url ? `Source URL: ${item.source_url}` : null,
        item.evidence_text ? `Evidence: ${item.evidence_text}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}
