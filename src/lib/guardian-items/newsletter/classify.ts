/**
 * Heuristic school-newsletter classifier (pure; unit-testable).
 * Complements LLM document classification — never invents child links.
 */

export type NewsletterClassification = {
  isSchoolNewsletter: boolean;
  confidence: number;
  reasons: string[];
  documentType: "school_newsletter" | null;
};

const STRONG_SIGNALS: { re: RegExp; weight: number; label: string }[] = [
  { re: /\bclassroom\s+newsletter\b/i, weight: 0.45, label: "Classroom Newsletter" },
  { re: /\bschool\s+newsletter\b/i, weight: 0.4, label: "School Newsletter" },
  { re: /\bweekly\s+newsletter\b/i, weight: 0.35, label: "Weekly Newsletter" },
  { re: /\bupcoming\s+events?\b/i, weight: 0.2, label: "Upcoming Events" },
  { re: /\bhomework\b/i, weight: 0.18, label: "Homework" },
  { re: /\bword\s+list\b/i, weight: 0.2, label: "Word List" },
  { re: /\bspelling\s+(?:words?|list|test)\b/i, weight: 0.2, label: "Spelling" },
  { re: /\bno\s+homework\b/i, weight: 0.15, label: "No homework" },
  { re: /\bearly\s+dismissal\b/i, weight: 0.15, label: "Early dismissal" },
  { re: /\bhalf[\s-]?day\b/i, weight: 0.12, label: "Half-day" },
  { re: /\bno\s+school\b/i, weight: 0.12, label: "No school" },
  { re: /\bback[\s-]?to[\s-]?school\b/i, weight: 0.12, label: "Back-to-School" },
  {
    re: /\b(?:mr|mrs|ms|miss|dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/,
    weight: 0.08,
    label: "Teacher name",
  },
  {
    re: /\b[A-Z0-9._%+-]+@(?:[a-z0-9.-]+\.)?(?:edu|k12\.[a-z]{2}|org)\b/i,
    weight: 0.1,
    label: "School email",
  },
  {
    re: /\b(?:elementary|middle|high)\s+school\b/i,
    weight: 0.12,
    label: "School name",
  },
  {
    re: /\bweek\s+of\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|\d)/i,
    weight: 0.15,
    label: "Week of date",
  },
];

const WEEKDAY_HOMEWORK_BLOCK =
  /\b(?:monday|tuesday|wednesday|thursday|friday)\s*[—–\-:]\s*.+/i;

/**
 * Classify source text / title / filename as a school newsletter.
 */
export function classifySchoolNewsletter(args: {
  sourceText?: string | null;
  title?: string | null;
  fileName?: string | null;
  documentType?: string | null;
}): NewsletterClassification {
  if (args.documentType === "school_newsletter") {
    return {
      isSchoolNewsletter: true,
      confidence: 0.99,
      reasons: ["document_type=school_newsletter"],
      documentType: "school_newsletter",
    };
  }

  const blob = [args.title, args.fileName, args.sourceText]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 12_000);

  if (!blob) {
    return {
      isSchoolNewsletter: false,
      confidence: 0,
      reasons: [],
      documentType: null,
    };
  }

  const reasons: string[] = [];
  let score = 0;

  for (const signal of STRONG_SIGNALS) {
    if (signal.re.test(blob)) {
      score += signal.weight;
      reasons.push(signal.label);
    }
  }

  if (WEEKDAY_HOMEWORK_BLOCK.test(blob) && /\bhomework\b/i.test(blob)) {
    score += 0.2;
    reasons.push("Weekday homework schedule");
  }

  if (/\bnewsletter\b/i.test(args.fileName ?? "")) {
    score += 0.25;
    reasons.push("Filename newsletter");
  }

  const confidence = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  const isSchoolNewsletter = confidence >= 0.45;

  return {
    isSchoolNewsletter,
    confidence,
    reasons,
    documentType: isSchoolNewsletter ? "school_newsletter" : null,
  };
}
