import type { ExtractedKnowledgeItem } from "./types";
import { CLS_STARTER_SOURCES } from "./constants";

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

function normalizeUrlKey(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return null;
  }
}

function titleFromPath(pathname: string): string {
  const clean = pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  if (clean === "/") return "";
  const segment = clean.split("/").filter(Boolean).pop() ?? "";
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Infer category (+ optional source name) from a public page URL.
 * Uses curated CLS starter URLs first, then path heuristics.
 */
export function inferSourceHintsFromUrl(
  url: string,
  allowedCategories: ReadonlyArray<string>
): { category: string | null; sourceName: string | null } {
  const allowed = new Set(
    allowedCategories.map((c) => c.trim().toLowerCase()).filter(Boolean)
  );
  const pick = (slug: string | null | undefined): string | null => {
    if (!slug) return null;
    const key = slug.toLowerCase();
    return allowed.has(key) ? key : null;
  };

  const key = normalizeUrlKey(url);
  if (!key) return { category: null, sourceName: null };

  for (const starter of CLS_STARTER_SOURCES) {
    const starterKey = normalizeUrlKey(starter.source_url);
    if (starterKey && starterKey === key) {
      return {
        category: pick(starter.category),
        sourceName: starter.source_name,
      };
    }
  }

  let pathname = "/";
  try {
    pathname = new URL(url.trim()).pathname.toLowerCase();
  } catch {
    return { category: null, sourceName: null };
  }

  const rules: Array<{ test: RegExp; category: string }> = [
    { test: /\/faculty-directory|\/contact/, category: "contact" },
    {
      test: /\/student-health|\/health-and-safety|\/health-safety/,
      category: "health-safety",
    },
    {
      test: /\/parent-resources|\/parentsweb|\/parentvue|\/facts/,
      category: "parent-resources",
    },
    {
      test: /\/uniforms|\/after-care|\/aftercare|\/summer-camps|\/community\//,
      category: "community",
    },
    { test: /\/athletics|\/sports/, category: "athletics" },
    { test: /\/calendar/, category: "calendar" },
    {
      test: /\/preschool|\/elementary|\/middle-school|\/high-school|\/academics/,
      category: "academics",
    },
    {
      test: /\/admissions|\/tuition|\/open-house|\/international-students/,
      category: "admissions",
    },
    { test: /\/about-us|\/about\//, category: "about" },
    { test: /\/school-assignment|\/boundaries/, category: "school-assignment" },
    { test: /\/transportation|\/bus/, category: "transportation" },
    { test: /\/schools?\//, category: "schools" },
  ];

  for (const rule of rules) {
    if (rule.test.test(pathname)) {
      const category = pick(rule.category);
      if (category) {
        return {
          category,
          sourceName: titleFromPath(pathname) || null,
        };
      }
    }
  }

  if (pathname === "/" || pathname === "") {
    return {
      category: pick("about") ?? pick("schools") ?? null,
      sourceName: null,
    };
  }

  return {
    category: null,
    sourceName: titleFromPath(pathname) || null,
  };
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
  const q = question.toLowerCase();
  if (
    /\b(principal|contact|directory|phone|address|staff|faculty)\b/.test(tokens) ||
    /\bwho\s+is\b/.test(q)
  ) {
    return ["schools", "contact"];
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
  if (/\b(admission|apply|enroll|tuition|tour|open\s+house)\b/.test(tokens)) {
    return ["admissions"];
  }
  if (/\b(uniform|dress\s+code|after\s*care|summer\s+camp)\b/.test(tokens)) {
    return ["community"];
  }
  if (/\b(athletic|sport|cougar)\b/.test(tokens)) {
    return ["athletics"];
  }
  if (/\b(preschool|elementary|middle\s+school|high\s+school|academic)\b/.test(tokens)) {
    return ["academics"];
  }
  if (/\b(health|safety|immunization|medication|weather)\b/.test(tokens)) {
    return ["health-safety", "parent-resources"];
  }
  if (/\b(facts|parents?\s*web|portal|lunch|supplies)\b/.test(tokens)) {
    return ["parent-resources"];
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
