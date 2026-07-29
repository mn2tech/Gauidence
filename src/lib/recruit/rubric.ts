import type { RubricWeights } from "./types";

export const DEFAULT_RUBRIC: RubricWeights = {
  weight_required_skills: 30,
  weight_relevant_experience: 25,
  weight_domain_experience: 15,
  weight_preferred_skills: 10,
  weight_education_certifications: 10,
  weight_career_stability: 5,
  weight_location_availability: 5,
};

export const RUBRIC_CATEGORIES: {
  key: keyof RubricWeights;
  label: string;
  description: string;
}[] = [
  {
    key: "weight_required_skills",
    label: "Required Skills",
    description: "Match against mandatory technical and professional skills.",
  },
  {
    key: "weight_relevant_experience",
    label: "Relevant Experience",
    description: "Years and depth of experience aligned with the role.",
  },
  {
    key: "weight_domain_experience",
    label: "Domain Experience",
    description: "Industry or functional domain familiarity.",
  },
  {
    key: "weight_preferred_skills",
    label: "Preferred Skills",
    description: "Nice-to-have skills and qualifications.",
  },
  {
    key: "weight_education_certifications",
    label: "Education & Certifications",
    description: "Degrees and professional certifications.",
  },
  {
    key: "weight_career_stability",
    label: "Career Recency & Stability",
    description: "Recent relevant roles and reasonable tenure patterns.",
  },
  {
    key: "weight_location_availability",
    label: "Location, Availability & Authorization",
    description: "Only when explicitly stated in the resume.",
  },
];

export function rubricTotal(weights: RubricWeights): number {
  return (
    weights.weight_required_skills +
    weights.weight_relevant_experience +
    weights.weight_domain_experience +
    weights.weight_preferred_skills +
    weights.weight_education_certifications +
    weights.weight_career_stability +
    weights.weight_location_availability
  );
}

export function isValidRubric(weights: RubricWeights): boolean {
  const total = rubricTotal(weights);
  if (total !== 100) return false;
  return RUBRIC_CATEGORIES.every(
    (c) => weights[c.key] >= 0 && weights[c.key] <= 100
  );
}

export function parseRubricWeights(
  body: Record<string, unknown>
): RubricWeights | null {
  const keys = RUBRIC_CATEGORIES.map((c) => c.key);
  const weights = {} as RubricWeights;
  for (const key of keys) {
    const raw = body[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    weights[key] = Math.round(raw);
  }
  return isValidRubric(weights) ? weights : null;
}
