import type { PersonalKnowledgeStore } from "./types";

export type GapSuggestion = {
  id: string;
  message: string;
};

/**
 * At most one proactive suggestion, and only when it is clearly useful.
 * Never fires a stack of onboarding questions on login.
 */
export function pickGapSuggestion(
  store: PersonalKnowledgeStore,
  options?: {
    documentCount?: number;
    schoolDocumentCount?: number;
    recentlyAddedVehicle?: boolean;
  }
): GapSuggestion | null {
  const vehicles = store.entities.filter((e) => e.kind === "vehicle").length;
  const people = store.entities.filter((e) => e.kind === "person").length;
  const birthdays = store.facts.filter((f) => f.predicate === "birthday").length;
  const maintenance = store.facts.filter((f) =>
    /oil_change|maintenance|needs/.test(f.predicate)
  ).length;

  if (options?.schoolDocumentCount && options.schoolDocumentCount >= 3) {
    return {
      id: "group-school-docs",
      message:
        "It looks like these documents relate to the same school. Would you like me to organize them together?",
    };
  }

  if (options?.recentlyAddedVehicle || (vehicles > 0 && maintenance === 0)) {
    return {
      id: "vehicle-maintenance",
      message:
        "You've added your vehicle. Would you like Guardian to track maintenance dates too?",
    };
  }

  if (people >= 2 && birthdays === 0) {
    return {
      id: "family-birthdays",
      message:
        "I know about your family, but I don't have any important birthdays yet.",
    };
  }

  if ((options?.documentCount ?? 0) >= 5 && vehicles === 0 && people === 0) {
    return {
      id: "tell-about-me",
      message:
        "You've uploaded several documents. Want to tell Guardian a bit about yourself so I can connect them?",
    };
  }

  return null;
}
