import type { SummitEntityRow } from "./types";

export const SUMMIT_CATEGORY_LABELS: Record<string, string> = {
  opportunities: "Opportunities",
  "prime-contractors": "Prime Contractors",
  agencies: "Agencies",
  sessions: "Sessions",
  resources: "Resources",
  takeaways: "Summit Takeaways",
};

export const SUMMIT_CATEGORY_IDS = Object.keys(SUMMIT_CATEGORY_LABELS);

export function filterSummitEntitiesForCategory(
  categoryId: string,
  entities: SummitEntityRow[]
): SummitEntityRow[] {
  switch (categoryId) {
    case "opportunities":
      return entities.filter((e) => e.entity_type === "opportunity");
    case "prime-contractors":
      return entities.filter(
        (e) =>
          e.entity_type === "organization" &&
          (e.properties as Record<string, string>).role === "prime_contractor"
      );
    case "agencies":
      return entities.filter((e) => e.entity_type === "agency");
    case "sessions":
      return entities.filter((e) => e.entity_type === "session");
    case "resources":
      return entities.filter((e) => e.entity_type === "resource");
    case "takeaways":
      return entities.filter(
        (e) =>
          e.entity_type === "action_item" &&
          (e.properties as Record<string, string>).category === "takeaway"
      );
    default:
      return [];
  }
}
