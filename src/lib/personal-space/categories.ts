import type { PersonalKnowledgeCategory } from "./types";

export const CATEGORY_LABELS: Record<PersonalKnowledgeCategory, string> = {
  people: "People",
  family: "Family",
  home: "Home",
  vehicles: "Vehicles",
  documents: "Documents",
  important_dates: "Important Dates",
  travel: "Travel",
  goals: "Goals",
  projects: "Projects",
  receipts: "Receipts",
  subscriptions: "Subscriptions",
  tasks: "Tasks",
  events: "Events",
  memories: "Memories",
  organizations: "Organizations",
  relationships: "Relationships",
  commitments: "Commitments",
  other: "Other",
};

/** Categories shown on My Knowledge when they have content. */
export const PRIMARY_KNOWLEDGE_CATEGORIES: PersonalKnowledgeCategory[] = [
  "people",
  "organizations",
  "documents",
  "important_dates",
  "vehicles",
  "events",
  "commitments",
];

export function categoryForEntityKind(
  kind: string
): PersonalKnowledgeCategory {
  switch (kind) {
    case "person":
      return "people";
    case "organization":
      return "organizations";
    case "vehicle":
      return "vehicles";
    case "event":
      return "events";
    case "commitment":
    case "task":
      return "commitments";
    case "document":
      return "documents";
    case "location":
      return "home";
    default:
      return "other";
  }
}

/**
 * Only reveal categories that already have knowledge.
 * Empty categories stay hidden for new users.
 */
export function visibleCategories(
  counts: Partial<Record<PersonalKnowledgeCategory, number>>
): PersonalKnowledgeCategory[] {
  return PRIMARY_KNOWLEDGE_CATEGORIES.filter(
    (c) => (counts[c] ?? 0) > 0
  );
}
