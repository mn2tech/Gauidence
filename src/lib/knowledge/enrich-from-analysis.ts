import type { DocumentAnalysisContext } from "./document-analysis-context";
import type {
  KnowledgeEntityPreview,
  KnowledgeInput,
  KnowledgeMemoryPreview,
  KnowledgePreview,
  KnowledgeRelationshipPreview,
  KnowledgeTimelinePreview,
} from "./types";

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function entitiesFromAnalysis(
  context: DocumentAnalysisContext
): KnowledgeEntityPreview[] {
  const entities: KnowledgeEntityPreview[] = [];

  for (const name of context.people) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    entities.push({
      type: "person",
      name: trimmed,
      normalizedName: normalizeName(trimmed),
      confidence: 0.92,
      metadata: { fromAnalysis: true },
    });
  }

  for (const name of context.organizations) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    entities.push({
      type: "organization",
      name: trimmed,
      normalizedName: normalizeName(trimmed),
      confidence: 0.9,
      metadata: { fromAnalysis: true },
    });
  }

  for (const amount of context.amounts) {
    const value = amount.value.trim();
    if (!value) continue;
    entities.push({
      type: "amount",
      name: value,
      normalizedName: normalizeName(value),
      confidence: amount.confidence,
      metadata: { fromAnalysis: true, label: amount.label },
    });
  }

  return entities;
}

function memoriesFromAnalysis(
  input: KnowledgeInput,
  context: DocumentAnalysisContext
): KnowledgeMemoryPreview[] {
  const memories: KnowledgeMemoryPreview[] = [];
  const base = {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  };

  if (context.summary.trim()) {
    memories.push({
      category: "summary",
      key: "document_summary",
      value: context.summary.trim(),
      confidence: context.overallConfidence,
      importance: 0.9,
      ...base,
    });
  }

  for (const obligation of context.obligations) {
    const value = obligation.trim();
    if (!value) continue;
    memories.push({
      category: "obligation",
      key: normalizeName(value),
      value,
      confidence: context.overallConfidence,
      importance: 0.85,
      ...base,
    });
  }

  for (const action of context.suggestedActions) {
    const value = action.trim();
    if (!value) continue;
    memories.push({
      category: "action",
      key: normalizeName(value),
      value,
      confidence: context.overallConfidence,
      importance: 0.8,
      ...base,
    });
  }

  for (const warning of context.warnings) {
    const value = warning.trim();
    if (!value) continue;
    memories.push({
      category: "warning",
      key: normalizeName(value),
      value,
      confidence: context.overallConfidence,
      importance: 0.75,
      ...base,
    });
  }

  return memories.slice(0, 25);
}

function timelineFromAnalysis(
  input: KnowledgeInput,
  context: DocumentAnalysisContext
): KnowledgeTimelinePreview[] {
  const events: KnowledgeTimelinePreview[] = [];

  for (const date of context.importantDates) {
    const title = date.label.trim() || date.value.trim();
    if (!title) continue;
    events.push({
      title,
      eventDate: date.date ?? undefined,
      category: date.isDeadline ? "deadline" : "event",
      confidence: date.confidence,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
  }

  return events.slice(0, 20);
}

function relationshipsFromAnalysis(
  input: KnowledgeInput,
  context: DocumentAnalysisContext
): KnowledgeRelationshipPreview[] {
  const relationships: KnowledgeRelationshipPreview[] = [];
  const people = context.people.map((p) => p.trim()).filter(Boolean);
  const orgs = context.organizations.map((o) => o.trim()).filter(Boolean);
  const seen = new Set<string>();

  for (const person of people) {
    for (const org of orgs) {
      const key = `${normalizeName(person)}|associated_with|${normalizeName(org)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relationships.push({
        subject: person,
        relationship: "associated_with",
        object: org,
        confidence: Math.min(0.9, context.overallConfidence + 0.05),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      });
    }
  }

  if (context.title.trim()) {
    for (const person of people.slice(0, 5)) {
      const key = `${normalizeName(person)}|mentioned_in|${normalizeName(context.title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relationships.push({
        subject: person,
        relationship: "mentioned_in",
        object: context.title.trim(),
        confidence: context.overallConfidence,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      });
    }
  }

  return relationships.slice(0, 20);
}

/** Build a KnowledgePreview from existing document analysis fields (no new AI calls). */
export function enrichFromDocumentAnalysis(
  input: KnowledgeInput,
  context: DocumentAnalysisContext
): KnowledgePreview {
  return {
    entities: entitiesFromAnalysis(context),
    suggestedMemories: memoriesFromAnalysis(input, context),
    suggestedTimelineEvents: timelineFromAnalysis(input, context),
    suggestedRelationships: relationshipsFromAnalysis(input, context),
  };
}
