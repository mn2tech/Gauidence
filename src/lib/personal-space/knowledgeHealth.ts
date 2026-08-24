import { visibleCategories } from "./categories";
import type {
  KnowledgeHealthSnapshot,
  PersonalKnowledgeCategory,
  PersonalKnowledgeStore,
} from "./types";

export type KnowledgeHealthInput = {
  store: PersonalKnowledgeStore;
  documentCount?: number;
};

export function buildKnowledgeHealth(
  input: KnowledgeHealthInput
): KnowledgeHealthSnapshot {
  const { store, documentCount = 0 } = input;
  const people = store.entities.filter((e) => e.kind === "person").length;
  const vehicles = store.entities.filter((e) => e.kind === "vehicle").length;
  const organizations = store.entities.filter(
    (e) => e.kind === "organization"
  ).length;
  const events = store.entities.filter((e) => e.kind === "event").length;
  const commitments = store.entities.filter(
    (e) => e.kind === "commitment" || e.kind === "task"
  ).length;
  const importantDates =
    store.facts.filter((f) =>
      ["birthday", "date", "due", "expires_on", "next_oil_change"].includes(
        f.predicate
      )
    ).length + events;

  const counts = {
    people,
    vehicles,
    documents: documentCount,
    importantDates,
    commitments,
    organizations,
    events,
  };

  const categoryCounts: Partial<Record<PersonalKnowledgeCategory, number>> = {
    people,
    vehicles,
    documents: documentCount,
    important_dates: importantDates,
    commitments,
    organizations,
    events,
    relationships: store.relationships.length,
  };

  const dimensions = {
    identity: store.facts.some((f) => f.predicate === "named"),
    people: people > 0,
    important_dates: importantDates > 0,
    documents: documentCount > 0,
    relationships: store.relationships.length > 0,
    assets: vehicles > 0,
    activities: events > 0 || commitments > 0,
    commitments: commitments > 0,
  };

  const filled = Object.values(dimensions).filter(Boolean).length;
  const label =
    filled <= 1 ? "Getting started" : filled <= 4 ? "Growing" : "Strong";

  let suggestedNextStep: string | null = null;
  if (vehicles > 0 && importantDates === 0) {
    suggestedNextStep = "Add important renewal dates.";
  } else if (people > 0 && importantDates === 0) {
    suggestedNextStep =
      "I know about your people, but I don't have any important birthdays yet.";
  } else if (documentCount === 0) {
    suggestedNextStep = "Upload a document or tell me something about yourself.";
  } else if (vehicles === 0 && filled >= 2) {
    suggestedNextStep = null;
  }

  return {
    label,
    counts,
    dimensions,
    suggestedNextStep,
    visibleCategories: visibleCategories(categoryCounts),
  };
}
