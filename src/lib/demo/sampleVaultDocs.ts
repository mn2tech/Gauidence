export type DemoSampleDoc = {
  id: string;
  title: string;
  kind: string;
  summary: string;
};

export const DEMO_SAMPLE_DOCS: DemoSampleDoc[] = [
  {
    id: "lease",
    title: "Apartment lease — Oak Street",
    kind: "Lease",
    summary:
      "12-month lease ending Aug 31, 2026. Pets allowed with $300 deposit. Rent $1,850/mo due on the 1st.",
  },
  {
    id: "insurance",
    title: "Auto insurance — Civic",
    kind: "Insurance",
    summary:
      "Policy renews March 15, 2026. Collision deductible $500. Roadside assistance included.",
  },
  {
    id: "letter",
    title: "HOA notice — spring assessment",
    kind: "Letter",
    summary:
      "Special assessment of $220 due April 30, 2026 for roof repairs.",
  },
];

export const DEMO_STARTER_QUESTIONS = [
  "When does my car insurance renew?",
  "What does my lease say about pets?",
  "Which documents expire this year?",
] as const;
