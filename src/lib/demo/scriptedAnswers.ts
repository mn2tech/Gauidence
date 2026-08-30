import { DEMO_SAMPLE_DOCS } from "./sampleVaultDocs";

export type DemoScriptedReply = {
  answer: string;
  sources: string[];
};

type Rule = {
  match: RegExp;
  answer: string;
  sourceIds: string[];
};

const RULES: Rule[] = [
  {
    match: /insurance|renew|policy|deductible|car|auto|civic/i,
    answer:
      "Your auto insurance for the Civic renews on March 15, 2026. The collision deductible is $500, and roadside assistance is included.",
    sourceIds: ["insurance"],
  },
  {
    match: /pet|animal|dog|cat/i,
    answer:
      "Your Oak Street lease allows pets with a $300 pet deposit. Rent is $1,850 per month, due on the 1st.",
    sourceIds: ["lease"],
  },
  {
    match: /hoa|assessment|roof|letter|notice/i,
    answer:
      "Your HOA spring assessment is $220, due April 30, 2026, for roof repairs.",
    sourceIds: ["letter"],
  },
  {
    match: /expir|deadline|due|this year|upcoming|remind/i,
    answer:
      "Coming up this year: auto insurance renews March 15, the HOA assessment is due April 30, and your lease ends August 31, 2026.",
    sourceIds: ["insurance", "letter", "lease"],
  },
  {
    match: /lease|rent|apartment|oak|end date|when.*end/i,
    answer:
      "Your apartment lease on Oak Street runs through August 31, 2026. Rent is $1,850 per month, due on the 1st.",
    sourceIds: ["lease"],
  },
];

const FALLBACK: DemoScriptedReply = {
  answer:
    "In this demo I can answer questions about the sample lease, auto insurance, and HOA notice. Try one of the suggested questions — or create your own vault to ask about your real documents.",
  sources: [],
};

function titlesFor(ids: string[]): string[] {
  return ids
    .map((id) => DEMO_SAMPLE_DOCS.find((doc) => doc.id === id)?.title)
    .filter((title): title is string => Boolean(title));
}

/** Keyword match against the sample vault — no LLM. */
export function answerDemoQuestion(question: string): DemoScriptedReply {
  const q = question.trim();
  if (!q) return FALLBACK;

  for (const rule of RULES) {
    if (rule.match.test(q)) {
      return {
        answer: rule.answer,
        sources: titlesFor(rule.sourceIds),
      };
    }
  }

  return FALLBACK;
}
