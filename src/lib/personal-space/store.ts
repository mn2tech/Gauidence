import type { ConversationExtractionResult, PersonalKnowledgeStore } from "./types";
import { extractPersonalKnowledgeFromText } from "./conversationExtract";
import { applyKnowledgeCorrection, dedupeVehicles } from "./corrections";

/** Fold an extraction into an in-memory store (for tests + session merge). */
export function mergeExtraction(
  store: PersonalKnowledgeStore,
  extraction: ConversationExtractionResult
): PersonalKnowledgeStore {
  const entities = [...store.entities];
  for (const e of extraction.entities) {
    if (e.status === "provisional" && extraction.confirmations.length) {
      // Keep provisional entities only when not purely confirmation-gated year guesses
      if (e.kind === "vehicle" || e.kind === "person" || e.kind === "organization") {
        const key = `${e.kind}:${e.name.toLowerCase()}`;
        if (!entities.some((x) => `${x.kind}:${x.name.toLowerCase()}` === key)) {
          entities.push(e);
        }
      }
      continue;
    }
    if (e.status === "rejected") continue;
    const key = `${e.kind}:${e.name.toLowerCase()}`;
    const idx = entities.findIndex(
      (x) => `${x.kind}:${x.name.toLowerCase()}` === key
    );
    if (idx >= 0) {
      entities[idx] = {
        ...entities[idx],
        ...e,
        attributes: { ...(entities[idx].attributes ?? {}), ...(e.attributes ?? {}) },
      };
    } else {
      entities.push(e);
    }
  }

  const relationships = [
    ...store.relationships,
    ...extraction.relationships.filter((r) => r.status !== "rejected"),
  ];
  const facts = [
    ...store.facts,
    ...extraction.facts.filter((f) => f.status !== "rejected"),
  ];

  let next: PersonalKnowledgeStore = { entities, relationships, facts };
  next = dedupeVehicles(next);

  // Apply year corrections from this turn
  for (const f of extraction.facts) {
    if (f.status === "corrected" && f.predicate === "model_year" && f.value) {
      next = applyKnowledgeCorrection(next, {
        subject: f.subject,
        predicate: "model_year",
        newValue: f.value,
        sourceExcerpt: f.sourceExcerpt,
      });
    }
  }

  return next;
}

export function emptyStore(): PersonalKnowledgeStore {
  return { entities: [], relationships: [], facts: [] };
}

/** Apply a sequence of user utterances into a store. */
export function ingestUtterances(utterances: string[]): PersonalKnowledgeStore {
  let store = emptyStore();
  for (const u of utterances) {
    store = mergeExtraction(store, extractPersonalKnowledgeFromText(u));
  }
  return store;
}
