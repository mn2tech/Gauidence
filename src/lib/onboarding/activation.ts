/**
 * First-session activation steps — Create Space → Add Knowledge → Ask Gideon.
 */

export const ACTIVATION_STEPS = [
  "welcome",
  "create_space",
  "add_knowledge",
  "first_value",
  "ask_gideon",
  "completed",
] as const;

export type ActivationStep = (typeof ACTIVATION_STEPS)[number];

export function isActivationStep(value: unknown): value is ActivationStep {
  return (
    typeof value === "string" &&
    (ACTIVATION_STEPS as readonly string[]).includes(value)
  );
}

/** Minimal progress shown during onboarding (3 user-facing milestones). */
export const ACTIVATION_PROGRESS = [
  { id: "space", label: "Create Space", steps: ["welcome", "create_space"] },
  {
    id: "knowledge",
    label: "Add Knowledge",
    steps: ["add_knowledge", "first_value"],
  },
  { id: "gideon", label: "Ask Gideon", steps: ["ask_gideon", "completed"] },
] as const;

export function activationProgressIndex(step: ActivationStep | null): number {
  if (!step || step === "completed") return 3;
  const idx = ACTIVATION_PROGRESS.findIndex((p) =>
    (p.steps as readonly string[]).includes(step)
  );
  return idx < 0 ? 0 : idx;
}

export const DEFAULT_SPACE_NAMES: Record<string, string> = {
  personal: "My Personal",
  family: "My Family",
  business: "My Business",
  school: "My School",
  organization: "My Organization",
  other: "My Space",
};

export const GUIDED_GIDEON_QUESTIONS = [
  "What are the important dates?",
  "What commitments were made?",
  "Who are the people involved?",
  "What should I follow up on?",
  "Summarize this for me.",
] as const;

export type FirstValueCategoryId =
  | "dates"
  | "people"
  | "organizations"
  | "commitments"
  | "amounts"
  | "follow_ups"
  | "topics";

export type FirstValueCategory = {
  id: FirstValueCategoryId;
  label: string;
  count: number;
  samples: string[];
};

const DATE_RE =
  /\b(date|deadline|due|expire|expir|renew|meeting|appointment|start|end)\b/i;
const PERSON_RE =
  /\b(person|people|name|contact|author|signatory|from|to|attendee|teacher|student|parent|client|employee)\b/i;
const ORG_RE =
  /\b(compan|organization|org\b|business|school|vendor|client company|employer|nonprofit)\b/i;
const COMMIT_RE =
  /\b(commit|promise|agree|obligation|deliver|will |must |shall |responsible)\b/i;
const AMOUNT_RE =
  /\$|€|£|\b(amount|total|fee|price|cost|payment|invoice|balance)\b/i;
const FOLLOW_RE =
  /\b(follow.?up|action|next step|todo|to-do|remind|call|email|reply)\b/i;

type FactLike = {
  label?: string | null;
  value?: string | null;
  date?: string | null;
};

function pushSample(
  map: Map<FirstValueCategoryId, { count: number; samples: string[] }>,
  id: FirstValueCategoryId,
  sample: string
) {
  const cur = map.get(id) ?? { count: 0, samples: [] };
  cur.count += 1;
  if (cur.samples.length < 3 && sample.trim()) {
    cur.samples.push(sample.trim().slice(0, 120));
  }
  map.set(id, cur);
}

/** Categorize extracted facts into first-value cards (only non-empty categories). */
export function categorizeFirstValueFacts(
  facts: FactLike[] | null | undefined
): FirstValueCategory[] {
  if (!facts?.length) return [];

  const map = new Map<
    FirstValueCategoryId,
    { count: number; samples: string[] }
  >();

  for (const fact of facts) {
    const label = (fact.label ?? "").trim();
    const value = (fact.value ?? "").trim();
    if (!label && !value) continue;
    const sample = value ? `${label ? `${label}: ` : ""}${value}` : label;
    const blob = `${label} ${value}`;

    let matched = false;
    if (fact.date || DATE_RE.test(blob)) {
      pushSample(map, "dates", sample);
      matched = true;
    }
    if (AMOUNT_RE.test(blob) || /\$[\d,]/.test(value)) {
      pushSample(map, "amounts", sample);
      matched = true;
    }
    if (COMMIT_RE.test(blob)) {
      pushSample(map, "commitments", sample);
      matched = true;
    }
    if (FOLLOW_RE.test(blob)) {
      pushSample(map, "follow_ups", sample);
      matched = true;
    }
    if (ORG_RE.test(blob)) {
      pushSample(map, "organizations", sample);
      matched = true;
    } else if (PERSON_RE.test(blob)) {
      pushSample(map, "people", sample);
      matched = true;
    }
    if (!matched) {
      pushSample(map, "topics", sample);
    }
  }

  const labels: Record<FirstValueCategoryId, string> = {
    dates: "important dates",
    people: "people",
    organizations: "organizations",
    commitments: "commitments",
    amounts: "amounts",
    follow_ups: "possible follow-ups",
    topics: "topics",
  };

  const order: FirstValueCategoryId[] = [
    "dates",
    "people",
    "organizations",
    "commitments",
    "amounts",
    "follow_ups",
    "topics",
  ];

  return order
    .filter((id) => (map.get(id)?.count ?? 0) > 0)
    .map((id) => {
      const data = map.get(id)!;
      return {
        id,
        label: labels[id],
        count: data.count,
        samples: data.samples,
      };
    });
}

export function firstValueCategoryLine(cat: FirstValueCategory): string {
  const n = cat.count;
  switch (cat.id) {
    case "dates":
      return `${n} important date${n === 1 ? "" : "s"}`;
    case "people":
      return `${n} ${n === 1 ? "person" : "people"}`;
    case "organizations":
      return `${n} organization${n === 1 ? "" : "s"}`;
    case "commitments":
      return `${n} commitment${n === 1 ? "" : "s"}`;
    case "amounts":
      return `${n} amount${n === 1 ? "" : "s"}`;
    case "follow_ups":
      return `${n} possible follow-up${n === 1 ? "" : "s"}`;
    case "topics":
      return `${n} topic${n === 1 ? "" : "s"}`;
  }
}

export type FirstKnowledgeCopy = {
  headline: string;
  subcopy: string;
  uploadLabel: string;
  uploadHint: string;
  notePlaceholder: string;
  starters: string[];
  sampleLabel: string;
};

/** Copy + starters for Space → first knowledge (activation). */
export function firstKnowledgeCopy(
  intent: string | null | undefined,
  schoolIntent?: string | null
): FirstKnowledgeCopy {
  const school = schoolIntent ?? "student";
  switch (intent) {
    case "family":
      return {
        headline: "Add one household thing Guardian should remember.",
        subcopy:
          "A flyer, schedule, or short note is enough to unlock Today and Ask.",
        uploadLabel: "Upload a school flyer or schedule",
        uploadHint: "PDF or photo",
        notePlaceholder:
          "e.g. Soccer practice Thursdays 5pm — pick up Maya at the field.",
        starters: [
          "Soccer practice Thursdays at 5pm — pick up at the field.",
          "School picture day is next Friday.",
          "Dentist for the kids — March 20 at 3:30pm.",
        ],
        sampleLabel: "Try a sample camp flyer",
      };
    case "business":
      return {
        headline: "Add one work item Guardian should remember.",
        subcopy:
          "A contract, invoice, or note gets you to first value fastest.",
        uploadLabel: "Upload an invoice or contract",
        uploadHint: "PDF or photo",
        notePlaceholder:
          "e.g. Follow up with Maya about the proposal by Friday.",
        starters: [
          "Follow up with Maya about the proposal by Friday.",
          "Invoice #4821 due April 15 — $2,400.",
          "Renew the vendor contract before June 1.",
        ],
        sampleLabel: "Try a sample receipt",
      };
    case "organization":
      return {
        headline: "Add one thing your organization needs remembered.",
        subcopy: "A policy, agenda, or note is enough to start.",
        uploadLabel: "Upload a policy or agenda",
        uploadHint: "PDF or photo",
        notePlaceholder: "e.g. Board meeting April 8 — approve the budget.",
        starters: [
          "Board meeting April 8 — approve the budget.",
          "Volunteer orientation is Saturday at 10am.",
          "Grant report due May 1.",
        ],
        sampleLabel: "Try a sample document",
      };
    case "school":
      if (school === "teacher") {
        return {
          headline: "Add one classroom thing to remember.",
          subcopy: "A lesson note or schedule unlocks Ask Gideon.",
          uploadLabel: "Upload a lesson plan or notes",
          uploadHint: "PDF or photo",
          notePlaceholder: "e.g. Parent conferences March 12–13.",
          starters: [
            "Parent conferences March 12–13.",
            "Unit test on fractions Friday.",
            "Field trip permission slips due Thursday.",
          ],
          sampleLabel: "Try a sample document",
        };
      }
      if (school === "parent") {
        return {
          headline: "Add one school item for your child.",
          subcopy: "A flyer, note, or photo is enough.",
          uploadLabel: "Upload a school flyer or schedule",
          uploadHint: "PDF or photo",
          notePlaceholder: "e.g. Picture day Friday — dress nice.",
          starters: [
            "Picture day Friday — dress nice.",
            "Book fair next week — need $20.",
            "Early dismissal Wednesday at noon.",
          ],
          sampleLabel: "Try a sample camp flyer",
        };
      }
      return {
        headline: "Add one school thing to remember.",
        subcopy: "Homework, notes, or a due date gets you started.",
        uploadLabel: "Upload homework or class notes",
        uploadHint: "PDF or photo",
        notePlaceholder: "e.g. History essay due Friday — 3 pages.",
        starters: [
          "History essay due Friday — 3 pages.",
          "Chem lab report due next Tuesday.",
          "Study group Thursday at the library.",
        ],
        sampleLabel: "Try a sample document",
      };
    case "personal":
    default:
      return {
        headline: "Give Guardian one thing to work with.",
        subcopy:
          "A document, photo, or short note is enough to unlock Ask Gideon.",
        uploadLabel: "Upload a document or photo",
        uploadHint: "PDF, photo, or file",
        notePlaceholder: "e.g. Renew car registration by April 30.",
        starters: [
          "Renew car registration by April 30.",
          "Call the dentist to reschedule.",
          "Pay rent by the 1st — $1,850.",
        ],
        sampleLabel: "Try a sample document",
      };
  }
}

/** Best first Ask question from what Guardian found. */
export function firstAskQuestionFromCategories(
  categories: FirstValueCategory[]
): string {
  const ids = new Set(categories.map((c) => c.id));
  if (ids.has("dates")) return "What are the important dates?";
  if (ids.has("follow_ups")) return "What should I follow up on?";
  if (ids.has("commitments")) return "What commitments were made?";
  if (ids.has("people")) return "Who are the people involved?";
  if (ids.has("amounts")) return "What amounts or payments matter?";
  return GUIDED_GIDEON_QUESTIONS[0]!;
}
