/**
 * Evidence-boundary helpers for Gideon answers.
 * AVAILABLE = present in authorized sources/index.
 * MENTIONED = referenced by an AVAILABLE source but not itself retrieved.
 * INFERRED = derived conclusion (must be labeled as such).
 */

/** Document / policy titles often referenced but not uploaded. */
const REFERENCED_DOC_PATTERNS: RegExp[] = [
  /\bForm\s+ADV(?:\s+Part\s+[0-9A-Z]+)?\b/gi,
  /\bForm\s+CRS\b/gi,
  /\b(?:privacy|cybersecurity|security|employee|compliance|data)\s+polic(?:y|ies)\b/gi,
  /\bemployee\s+handbook\b/gi,
  /\bcode\s+of\s+conduct\b/gi,
  /\b(?:master|services)\s+agreement\b/gi,
  /\b(?:statement\s+of\s+work|SOW)\b/gi,
];

const REFERENCE_CUE =
  /\b(see|consult|refer(?:s|red)?\s+to|reference[sd]?|additional\s+(?:details?|information|disclosures?)|for\s+more\s+(?:details?|information)|described\s+in|set\s+forth\s+in)\b/i;

export function normalizeDocLabel(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(pdf|docx?|txt|md|html?)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when `candidate` appears among available source labels (loose match). */
export function isDocumentAvailable(
  candidate: string,
  availableLabels: string[]
): boolean {
  const key = normalizeDocLabel(candidate);
  if (!key || key.length < 3) return false;
  return availableLabels.some((label) => {
    const avail = normalizeDocLabel(label);
    if (!avail) return false;
    return (
      avail === key ||
      avail.includes(key) ||
      key.includes(avail) ||
      (key.length >= 8 && avail.includes(key.slice(0, 8)))
    );
  });
}

/** Collect titles mentioned in evidence text that look like referenced documents. */
export function extractReferencedDocumentMentions(
  texts: string[]
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const hasCue = REFERENCE_CUE.test(trimmed);

    for (const pattern of REFERENCED_DOC_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of trimmed.matchAll(pattern)) {
        const name = match[0]?.replace(/\s+/g, " ").trim();
        if (!name) continue;
        // Prefer mentions that appear near a reference cue, but keep clear form titles.
        if (!hasCue && !/^Form\s+/i.test(name)) continue;
        const key = normalizeDocLabel(name);
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(name);
      }
    }
  }

  return found.slice(0, 6);
}

/**
 * Mentions that are referenced by available evidence but not present
 * in the authorized source/index labels.
 */
export function findMentionedButUnavailable(args: {
  evidenceTexts: string[];
  availableDocumentLabels: string[];
}): string[] {
  const mentioned = extractReferencedDocumentMentions(args.evidenceTexts);
  return mentioned.filter(
    (name) => !isDocumentAvailable(name, args.availableDocumentLabels)
  );
}

/** Map ontology relationship types to short natural-language verbs. */
export function relationshipTypeToProse(type: string): string {
  const t = type.trim().toUpperCase();
  switch (t) {
    case "SERVES":
    case "SERVICES":
    case "PROVIDES_SERVICE_TO":
    case "SERVICE_FOR":
    case "CLIENT_OF":
      return "offers or relates to";
    case "EMPLOYS":
      return "employs";
    case "WORKS_FOR":
      return "works for";
    case "ENGAGES":
      return "engages";
    case "CONTACT_FOR":
      return "is a contact for";
    case "HAS_PROJECT":
    case "WORKS_ON":
      return "has project work involving";
    case "HAS_CONTRACT":
      return "has a contract involving";
    case "PROPOSED_TO":
      return "has proposal activity involving";
    case "OWNS":
      return "owns";
    case "PARTNER_OF":
      return "partners with";
    case "VENDOR_OF":
      return "is a vendor of";
    case "ISSUED_BY":
      return "was issued by";
    case "ISSUED_TO":
      return "was issued to";
    case "MENTIONED_IN":
      return "is mentioned in";
    case "RELATED_TO":
    case "RELATES_TO":
      return "is related to";
    default:
      return "is connected to";
  }
}

export function formatRelationshipProse(args: {
  subject: string;
  type: string;
  related: string;
  direction: "outgoing" | "incoming";
}): string {
  const verb = relationshipTypeToProse(args.type);
  if (/^SERVES$|^SERVICES$|^CLIENT_OF$/i.test(args.type)) {
    if (args.direction === "incoming") {
      return `${args.subject} appears as a client or prospect related to ${args.related}.`;
    }
    return `${args.subject} offers or serves ${args.related}.`;
  }
  if (args.direction === "incoming") {
    return `${args.related} ${verb} ${args.subject}.`;
  }
  return `${args.subject} ${verb} ${args.related}.`;
}

/** Soft inference prefix when a claim is derived rather than quoted. */
export function inferencePrefix(): string {
  return "Based on the available information";
}
