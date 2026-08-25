import type { ExtractedKnowledgeItem } from "./types";

/**
 * Heuristic fallback when LLM extraction fails — split into coarse chunks
 * so admins still have reviewable evidence rather than nothing.
 */
export function fallbackItemsFromText(args: {
  text: string;
  category: string;
  sourceName: string;
}): ExtractedKnowledgeItem[] {
  const chunks = args.text
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 40)
    .slice(0, 8);

  if (!chunks.length) {
    const excerpt = args.text.trim().slice(0, 1500);
    if (!excerpt) return [];
    return [
      {
        title: args.sourceName,
        content: excerpt,
        category: args.category,
        subcategory: "",
        school: "",
        grade_level: "",
        evidence_text: excerpt,
      },
    ];
  }

  return chunks.map((chunk, i) => {
    const firstLine = chunk.split("\n")[0]?.trim() || `Item ${i + 1}`;
    return {
      title: firstLine.slice(0, 120),
      content: chunk.slice(0, 4000),
      category: args.category,
      subcategory: "",
      school: "",
      grade_level: "",
      evidence_text: chunk.slice(0, 4000),
    };
  });
}

/** Pure helper for tests: unpublished statuses must never be returned. */
export function filterPublishedOnly(
  items: Array<{ status: string }>
): Array<{ status: string }> {
  return items.filter((i) => i.status === "published");
}

export function scoreKnowledgeRelevance(args: {
  title: string;
  content: string;
  category: string;
  school?: string | null;
  question: string;
  schoolHint?: string | null;
}): number {
  const tokens = args.question
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const hay = [args.title, args.content, args.category, args.school ?? ""]
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += 1;
  }
  if (args.schoolHint && args.school) {
    if (args.school.toLowerCase().includes(args.schoolHint.toLowerCase())) {
      score += 5;
    }
  } else if (!args.school) {
    score += 2;
  }
  return score;
}
