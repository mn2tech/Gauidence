/**
 * Research brief helpers (pure — safe for unit tests).
 */

export const RESEARCH_SYSTEM = `You are Gideon, writing a Research brief for Guardian.

The user asked you to research a company, organization, person, or topic using LIVE WEB RESULTS plus optional GUARDIAN VAULT CONTEXT from their private vault.

Rules:
- Prefer WEB SEARCH RESULTS for public facts. Cite sources by number like [1], [2] matching the result list.
- Use GUARDIAN VAULT CONTEXT only for the user's own documents, logs, and profiles. Never invent vault facts.
- Never present web claims as if they came from the user's vault.
- Be cautious with people research: stick to public professional/business information. Do not speculate about private life, credit, or criminal history. If sources are thin, say so.
- Never give definitive legal, medical, tax, or hiring advice. Flag uncertainty under NEEDS VERIFICATION.
- If web results are empty or irrelevant, say you could not find reliable public information.
- Tone: calm, clear, trustworthy. Not dramatic or judgmental.

Use these section headings when relevant (omit empty ones):

## OVERVIEW
Who/what this is, in a few sentences grounded in sources.

## FROM THE WEB
Public facts from search results, with [n] citations.

## GUARDIAN CONTEXT
Only if vault context is present: how this subject appears in the user's Guardian vault (documents, logs, linked profiles). Say clearly these are the user's records.

## POSSIBLE CONCERNS
Notable risks, complaints, lawsuits, closures, or mismatches — only when supported by sources. Otherwise omit.

## NEEDS VERIFICATION
Anything uncertain, conflicting, or thin.

## GIDEON'S SUGGESTION
One practical next step (e.g. save this brief to the vault, request a document, or ask a follow-up).

Guardian watches. Gideon explains. The user decides.`;

export type ResearchSectionKind =
  | "overview"
  | "from_the_web"
  | "guardian_context"
  | "possible_concerns"
  | "needs_verification"
  | "suggestion"
  | "body";

export type ResearchSection = {
  kind: ResearchSectionKind;
  title: string;
  body: string;
};

const SECTION_MATCHERS: {
  match: RegExp;
  kind: ResearchSectionKind;
  title: string;
}[] = [
  { match: /^#{1,3}\s*OVERVIEW\s*$/i, kind: "overview", title: "Overview" },
  {
    match: /^#{1,3}\s*FROM THE WEB\s*$/i,
    kind: "from_the_web",
    title: "From the web",
  },
  {
    match: /^#{1,3}\s*GUARDIAN CONTEXT\s*$/i,
    kind: "guardian_context",
    title: "Guardian context",
  },
  {
    match: /^#{1,3}\s*POSSIBLE CONCERNS\s*$/i,
    kind: "possible_concerns",
    title: "Possible concerns",
  },
  {
    match: /^#{1,3}\s*NEEDS VERIFICATION\s*$/i,
    kind: "needs_verification",
    title: "Needs verification",
  },
  {
    match: /^#{1,3}\s*GIDEON'?S SUGGESTION\s*$/i,
    kind: "suggestion",
    title: "Gideon's suggestion",
  },
];

/** Split a Research brief into labeled sections for the UI. */
export function parseResearchBrief(raw: string): ResearchSection[] {
  const text = raw.trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const sections: ResearchSection[] = [];
  let current: ResearchSection | null = null;

  const flush = () => {
    if (!current) return;
    current.body = current.body.trim();
    if (current.body || current.kind !== "body") sections.push(current);
    current = null;
  };

  for (const line of lines) {
    const heading = SECTION_MATCHERS.find((m) => m.match.test(line.trim()));
    if (heading) {
      flush();
      current = { kind: heading.kind, title: heading.title, body: "" };
      continue;
    }
    if (!current) {
      current = { kind: "body", title: "Brief", body: "" };
    }
    current.body += (current.body ? "\n" : "") + line;
  }
  flush();

  if (sections.length === 0) {
    return [{ kind: "body", title: "Brief", body: text }];
  }
  return sections;
}

export function sanitizeResearchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.trim().replace(/\s+/g, " ");
  if (q.length < 2) return null;
  return q.slice(0, 300);
}

export type ResearchSubjectKind = "company" | "person" | "other";

export function normalizeSubjectKind(raw: unknown): ResearchSubjectKind {
  if (raw === "company" || raw === "person" || raw === "other") return raw;
  return "other";
}
