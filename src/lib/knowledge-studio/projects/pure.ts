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

/** Common parent/ask typos → canonical tokens used in MCPS pages. */
const ASK_TYPO_MAP: Record<string, string> = {
  prinicpal: "principal",
  pricipal: "principal",
  princpal: "principal",
  principals: "principal",
  prinicipal: "principal",
  adress: "address",
  addres: "address",
  phonenumber: "phone",
};

const CONTACT_SYNONYMS = ["principal", "contact", "directory", "phone", "address"] as const;

/**
 * Tokenize an ask question with light typo correction and contact synonyms
 * so "prinicpal's name" still retrieves school directory items.
 */
export function expandAskTokens(question: string): string[] {
  const raw = question
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const out = new Set<string>();
  for (const t of raw) {
    out.add(t);
    const fixed = ASK_TYPO_MAP[t];
    if (fixed) out.add(fixed);
  }

  const joined = [...out].join(" ");
  const isContactIntent =
    /\b(principal|who\s+is|contact|directory|phone|address|staff)\b/.test(joined) ||
    raw.some((t) => ASK_TYPO_MAP[t] === "principal");

  if (isContactIntent) {
    for (const s of CONTACT_SYNONYMS) out.add(s);
  }

  return [...out];
}

/** Prefer these knowledge categories for common parent intents. */
export function preferredCategoriesForQuestion(question: string): string[] {
  const tokens = expandAskTokens(question).join(" ");
  if (
    /\b(principal|contact|directory|phone|address|staff)\b/.test(tokens) ||
    /\bwho\s+is\b/.test(question.toLowerCase())
  ) {
    return ["schools"];
  }
  if (/\b(bus|transport|route|depot)\b/.test(tokens)) {
    return ["transportation"];
  }
  if (/\b(calendar|early\s+release|no\s+school|holiday|day\s+off)\b/.test(tokens)) {
    return ["calendar"];
  }
  if (/\b(assign|boundary|which\s+school)\b/.test(tokens)) {
    return ["school-assignment"];
  }
  return [];
}

export function scoreKnowledgeRelevance(args: {
  title: string;
  content: string;
  category: string;
  school?: string | null;
  question: string;
  schoolHint?: string | null;
  preferredCategories?: string[];
}): number {
  const tokens = expandAskTokens(args.question);
  const hay = [args.title, args.content, args.category, args.school ?? ""]
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += 1;
  }
  if (args.schoolHint && args.school) {
    const hint = args.schoolHint.toLowerCase();
    const school = args.school.toLowerCase();
    if (school.includes(hint) || hint.includes(school)) {
      score += 5;
    }
  } else if (!args.school) {
    score += 2;
  }
  const preferred = args.preferredCategories ?? preferredCategoriesForQuestion(args.question);
  if (preferred.includes(args.category.trim().toLowerCase())) {
    score += 4;
  }
  return score;
}
