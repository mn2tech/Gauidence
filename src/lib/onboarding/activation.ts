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
