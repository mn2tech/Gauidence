import type { KnowledgeFactCandidate } from "./types";
import type { KnowledgeRetrievalResult } from "./retrieve";

export function formatKnowledgeForGideon(
  result: KnowledgeRetrievalResult,
  profileNames: Record<string, string>
): string {
  if (
    result.facts.length === 0 &&
    result.relationships.length === 0 &&
    result.entities.length === 0
  ) {
    return "(none)";
  }

  const blocks: string[] = [];

  if (result.facts.length > 0) {
    blocks.push("STRUCTURED FACTS (cite source document when using these):");
    for (const fact of result.facts) {
      const vault = profileNames[fact.profileId]?.trim();
      const vaultLabel = vault ? ` | vault:${vault}` : "";
      const value = formatFactValue(fact);
      const source = fact.sourceFileName
        ? ` | source:${fact.sourceFileName} | doc:${fact.sourceDocumentId}`
        : "";
      const excerpt = fact.sourceExcerpt
        ? `\n  Excerpt: "${fact.sourceExcerpt.slice(0, 200)}"`
        : "";
      blocks.push(
        `- ${fact.subjectName} → ${fact.predicate} → ${value}${vaultLabel}${source} | confidence:${fact.confidence.toFixed(2)} | status:${fact.reviewStatus}${excerpt}`
      );
    }
  }

  if (result.relationships.length > 0) {
    blocks.push("", "RELATIONSHIPS:");
    for (const rel of result.relationships.slice(0, 8)) {
      blocks.push(
        `- ${rel.subject} —[${rel.relationship}]→ ${rel.object} (confidence:${rel.confidence.toFixed(2)})`
      );
    }
  }

  return blocks.join("\n");
}

function formatFactValue(fact: KnowledgeFactCandidate): string {
  const base = fact.objectValue ?? "(unknown)";
  if (fact.unit) return `${base} per ${fact.unit}`;
  if (fact.effectiveDate) return `${base} (effective ${fact.effectiveDate})`;
  if (fact.expirationDate) return `expires ${fact.expirationDate}`;
  return base;
}
