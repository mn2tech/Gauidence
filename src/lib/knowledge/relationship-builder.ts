import type {
  KnowledgeEntityPreview,
  KnowledgeInput,
  KnowledgeRelationshipPreview,
} from "./types";

const RELATION_PATTERNS: Array<{
  pattern: RegExp;
  relationship: string;
  confidence: number;
}> = [
  {
    pattern: /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)\s+is\s+(?:the\s+)?([A-Za-z][\w\s-]{2,40})\b/g,
    relationship: "is",
    confidence: 0.65,
  },
  {
    pattern: /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)\s+works\s+(?:at|for)\s+([A-Z][\w&.'-]+(?:\s+[A-Z][\w&.'-]+)*)\b/g,
    relationship: "works_at",
    confidence: 0.7,
  },
  {
    pattern: /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)\s+(?:met|called|emailed|visited)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\b/g,
    relationship: "interacted_with",
    confidence: 0.6,
  },
];

function pairKey(subject: string, relationship: string, object: string): string {
  return `${subject.toLowerCase()}|${relationship}|${object.toLowerCase()}`;
}

/** Suggest relationships from text patterns and entities (shadow mode — no persistence). */
export function suggestRelationships(
  input: KnowledgeInput,
  entities: KnowledgeEntityPreview[]
): KnowledgeRelationshipPreview[] {
  const relationships: KnowledgeRelationshipPreview[] = [];
  const seen = new Set<string>();

  for (const { pattern, relationship, confidence } of RELATION_PATTERNS) {
    for (const match of input.content.matchAll(pattern)) {
      const subject = match[1]?.trim();
      const object = match[2]?.trim();
      if (!subject || !object) continue;
      const key = pairKey(subject, relationship, object);
      if (seen.has(key)) continue;
      seen.add(key);
      relationships.push({
        subject,
        relationship,
        object,
        confidence,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      });
    }
  }

  const people = entities.filter((e) => e.type === "person").slice(0, 3);
  const orgs = entities.filter((e) => e.type === "organization").slice(0, 3);
  for (const person of people) {
    for (const org of orgs) {
      const key = pairKey(person.name, "mentioned_with", org.name);
      if (seen.has(key)) continue;
      seen.add(key);
      relationships.push({
        subject: person.name,
        relationship: "mentioned_with",
        object: org.name,
        confidence: 0.45,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      });
    }
  }

  return relationships.slice(0, 20);
}
