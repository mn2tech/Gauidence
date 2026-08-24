import type { PersonalFact, PersonalKnowledgeStore } from "./types";

/**
 * Apply a user correction to authoritative knowledge.
 * Supersedes prior values for the same subject+predicate.
 */
export function applyKnowledgeCorrection(
  store: PersonalKnowledgeStore,
  correction: {
    subject: string;
    predicate: string;
    newValue: string;
    sourceExcerpt?: string;
  }
): PersonalKnowledgeStore {
  const subjectRe = new RegExp(correction.subject, "i");
  const facts: PersonalFact[] = store.facts.map((f) => {
    if (
      f.predicate === correction.predicate &&
      subjectRe.test(f.subject) &&
      f.status !== "rejected"
    ) {
      return { ...f, status: "rejected" as const };
    }
    return f;
  });

  facts.push({
    subject: correction.subject,
    predicate: correction.predicate,
    object: correction.newValue,
    value: correction.newValue,
    confidence: 0.98,
    confidenceLevel: "high",
    status: "corrected",
    sourceExcerpt: correction.sourceExcerpt,
  });

  const entities = store.entities.map((e) => {
    if (e.kind === "vehicle" && subjectRe.test(e.name)) {
      return {
        ...e,
        attributes: {
          ...(e.attributes ?? {}),
          year: correction.newValue,
        },
        status: "corrected" as const,
      };
    }
    return e;
  });

  return {
    entities,
    relationships: store.relationships,
    facts,
  };
}

/** Merge duplicate vehicle mentions into one entity. */
export function dedupeVehicles(
  store: PersonalKnowledgeStore
): PersonalKnowledgeStore {
  const seen = new Map<string, (typeof store.entities)[0]>();
  for (const e of store.entities) {
    if (e.kind !== "vehicle") continue;
    const key = e.name.trim().toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) seen.set(key, e);
  }
  const vehicles = [...seen.values()];
  const others = store.entities.filter((e) => e.kind !== "vehicle");
  return {
    ...store,
    entities: [...others, ...vehicles],
  };
}
