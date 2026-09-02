import type {
  PublishedSummitKnowledge,
  SummitEntityRow,
  SummitRelationshipRow,
} from "./types";
import { SUMMIT_CATEGORY_IDS } from "./categories";
import { filterSummitEntitiesForCategory } from "./categories";

export type SummitCategoryCounts = Record<string, number>;

export function entityMap(
  entities: SummitEntityRow[]
): Map<string, SummitEntityRow> {
  return new Map(entities.map((e) => [e.id, e]));
}

export function relationshipsForEntity(
  knowledge: PublishedSummitKnowledge,
  entityId: string,
  relationshipType?: string
): SummitRelationshipRow[] {
  return knowledge.relationships.filter((rel) => {
    if (relationshipType && rel.relationship_type !== relationshipType) {
      return false;
    }
    return (
      rel.source_entity_id === entityId || rel.target_entity_id === entityId
    );
  });
}

export function relatedEntityList(
  knowledge: PublishedSummitKnowledge,
  entityId: string,
  options?: {
    relationshipType?: string;
    entityType?: string;
    direction?: "out" | "in" | "both";
  }
): SummitEntityRow[] {
  const map = entityMap(knowledge.entities);
  const direction = options?.direction ?? "both";
  const found: SummitEntityRow[] = [];

  for (const rel of knowledge.relationships) {
    if (
      options?.relationshipType &&
      rel.relationship_type !== options.relationshipType
    ) {
      continue;
    }
    if (direction !== "in" && rel.source_entity_id === entityId) {
      const target = map.get(rel.target_entity_id);
      if (target) found.push(target);
    }
    if (direction !== "out" && rel.target_entity_id === entityId) {
      const source = map.get(rel.source_entity_id);
      if (source) found.push(source);
    }
  }

  const typeFilter = options?.entityType;
  return found.filter(
    (e, i, arr) =>
      arr.findIndex((x) => x.id === e.id) === i &&
      (!typeFilter || e.entity_type === typeFilter)
  );
}

export function isPrimeContractor(org: SummitEntityRow): boolean {
  if (org.entity_type !== "organization") return false;
  const role = (org.properties as Record<string, string>).role;
  return role === "prime_contractor";
}

export function summitCategoryCounts(
  knowledge: PublishedSummitKnowledge
): SummitCategoryCounts {
  const counts: SummitCategoryCounts = {};
  for (const categoryId of SUMMIT_CATEGORY_IDS) {
    counts[categoryId] = filterSummitEntitiesForCategory(
      categoryId,
      knowledge.entities
    ).length;
  }
  return counts;
}

export type SummitCoverageReport = {
  counts: Record<string, number>;
  gaps: string[];
};

export function buildSummitCoverageReport(
  knowledge: PublishedSummitKnowledge
): SummitCoverageReport {
  const people = knowledge.entities.filter((e) => e.entity_type === "person");
  const organizations = knowledge.entities.filter(
    (e) => e.entity_type === "organization"
  );
  const counts: Record<string, number> = {
    Sessions: knowledge.entities.filter((e) => e.entity_type === "session")
      .length,
    People: people.length,
    Organizations: organizations.length,
    Opportunities: knowledge.entities.filter(
      (e) => e.entity_type === "opportunity"
    ).length,
    Agencies: knowledge.entities.filter((e) => e.entity_type === "agency")
      .length,
    Resources: knowledge.entities.filter((e) => e.entity_type === "resource")
      .length,
    Takeaways: knowledge.entities.filter(
      (e) =>
        e.entity_type === "action_item" &&
        (e.properties as Record<string, string>).category === "takeaway"
    ).length,
  };

  const gaps: string[] = [];
  if (counts.Agencies < 2) gaps.push("Agencies");
  if (counts.Opportunities < 3) gaps.push("Opportunities");
  if (counts.Resources < 3) gaps.push("Resources");
  if (counts.Takeaways < 3) gaps.push("Takeaways");

  return { counts, gaps };
}

export function entitiesDiscoverableInCategory(
  knowledge: PublishedSummitKnowledge,
  categoryId: string
): SummitEntityRow[] {
  return filterSummitEntitiesForCategory(categoryId, knowledge.entities);
}
