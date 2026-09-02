import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrganizationPageData,
  PublishedSummitKnowledge,
  SummitEntityRow,
  SummitRelationshipRow,
  SummitSpaceRow,
} from "./types";

/**
 * Load published+public summit knowledge for anonymous attendees.
 * Safe for anon clients (RLS) or service role with explicit filters.
 */
export async function loadPublishedSummitKnowledge(
  supabase: SupabaseClient,
  summitSlug: string
): Promise<PublishedSummitKnowledge | null> {
  const { data: space } = await supabase
    .from("summit_spaces")
    .select("*")
    .eq("slug", summitSlug)
    .eq("is_public", true)
    .maybeSingle();

  if (!space) return null;

  const [{ data: entities }, { data: relationships }] = await Promise.all([
    supabase
      .from("summit_entities")
      .select("*")
      .eq("summit_slug", summitSlug)
      .eq("lifecycle_status", "published")
      .eq("visibility", "public")
      .order("name", { ascending: true }),
    supabase
      .from("summit_relationships")
      .select("*")
      .eq("summit_slug", summitSlug)
      .eq("lifecycle_status", "published")
      .eq("visibility", "public"),
  ]);

  return {
    space: space as SummitSpaceRow,
    entities: (entities ?? []) as SummitEntityRow[],
    relationships: (relationships ?? []) as SummitRelationshipRow[],
  };
}

export function entitiesByType(
  entities: SummitEntityRow[],
  entityType: string
): SummitEntityRow[] {
  return entities.filter((e) => e.entity_type === entityType);
}

export function entityBySlug(
  entities: SummitEntityRow[],
  slug: string
): SummitEntityRow | undefined {
  return entities.find((e) => e.slug === slug);
}

export function relatedEntities(
  knowledge: PublishedSummitKnowledge,
  entityId: string,
  relationshipType?: string
): SummitEntityRow[] {
  const entityMap = new Map(knowledge.entities.map((e) => [e.id, e]));
  const related: SummitEntityRow[] = [];

  for (const rel of knowledge.relationships) {
    if (relationshipType && rel.relationship_type !== relationshipType) {
      continue;
    }
    if (rel.source_entity_id === entityId) {
      const target = entityMap.get(rel.target_entity_id);
      if (target) related.push(target);
    }
    if (rel.target_entity_id === entityId) {
      const source = entityMap.get(rel.source_entity_id);
      if (source) related.push(source);
    }
  }

  return related;
}

export function buildOrganizationPageData(
  knowledge: PublishedSummitKnowledge,
  orgSlug: string
): OrganizationPageData | null {
  const organization = entityBySlug(knowledge.entities, orgSlug);
  if (!organization || organization.entity_type !== "organization") {
    return null;
  }

  const entityMap = new Map(knowledge.entities.map((e) => [e.id, e]));

  const speakers = knowledge.relationships
    .filter(
      (r) =>
        r.target_entity_id === organization.id &&
        r.relationship_type === "works_for"
    )
    .map((r) => entityMap.get(r.source_entity_id))
    .filter((e): e is SummitEntityRow => !!e && e.entity_type === "person");

  const sessions = knowledge.relationships
    .filter(
      (r) =>
        r.target_entity_id === organization.id &&
        r.relationship_type === "mentions"
    )
    .map((r) => entityMap.get(r.source_entity_id))
    .filter((e): e is SummitEntityRow => !!e && e.entity_type === "session");

  const relatedEntitiesList = relatedEntities(knowledge, organization.id).filter(
    (e) => e.id !== organization.id
  );

  return {
    organization,
    speakers,
    sessions,
    relatedEntities: relatedEntitiesList,
  };
}

export function formatSummitKnowledgeForPrompt(
  knowledge: PublishedSummitKnowledge
): string {
  const parts: string[] = [];

  const publicEntities = knowledge.entities.filter(
    (e) => e.lifecycle_status === "published" && e.visibility === "public"
  );
  const publicRelationships = knowledge.relationships.filter(
    (r) => r.lifecycle_status === "published" && r.visibility === "public"
  );

  parts.push(`SUMMIT: ${knowledge.space.name}`);
  if (knowledge.space.subtitle) {
    parts.push(`Subtitle: ${knowledge.space.subtitle}`);
  }
  if (knowledge.space.description) {
    parts.push(`Description: ${knowledge.space.description}`);
  }

  const orgs = entitiesByType(publicEntities, "organization");
  if (orgs.length) {
    parts.push("\nORGANIZATIONS (VERIFIED SUMMIT INFORMATION):");
    for (const org of orgs) {
      const props = org.properties as Record<string, string>;
      const lines = [
        `- ${org.name}`,
        org.description ? `  ${org.description}` : null,
        props.role ? `  Role: ${props.role}` : null,
        props.division ? `  Division: ${props.division}` : null,
        props.small_business_engagement
          ? `  Small business engagement: ${props.small_business_engagement}`
          : null,
        `  Source: ${org.source_label ?? "Summit materials"}`,
        `  Attribution: VERIFIED SUMMIT INFORMATION`,
      ].filter(Boolean);
      parts.push(lines.join("\n"));
    }
  }

  const people = entitiesByType(publicEntities, "person");
  if (people.length) {
    parts.push("\nSPEAKERS (VERIFIED SUMMIT INFORMATION):");
    for (const person of people) {
      const props = person.properties as Record<string, string>;
      const lines = [
        `- ${person.name}`,
        props.title ? `  Title: ${props.title}` : null,
        props.organization ? `  Organization: ${props.organization}` : null,
        person.description ? `  ${person.description}` : null,
        `  Source: ${person.source_label ?? "Summit materials"}`,
        `  Attribution: VERIFIED SUMMIT INFORMATION`,
      ].filter(Boolean);
      parts.push(lines.join("\n"));
    }
  }

  const sessions = entitiesByType(publicEntities, "session");
  if (sessions.length) {
    parts.push("\nSESSIONS (VERIFIED SUMMIT INFORMATION):");
    for (const session of sessions) {
      parts.push(
        [
          `- ${session.name}`,
          session.description ? `  ${session.description}` : null,
          `  Source: ${session.source_label ?? "Summit materials"}`,
          `  Attribution: VERIFIED SUMMIT INFORMATION`,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  }

  const opportunities = entitiesByType(publicEntities, "opportunity");
  if (opportunities.length) {
    parts.push("\nOPPORTUNITIES:");
    for (const opp of opportunities) {
      parts.push(`- ${opp.name}: ${opp.description ?? ""}`);
    }
  }

  const resources = entitiesByType(publicEntities, "resource");
  if (resources.length) {
    parts.push("\nRESOURCES:");
    for (const res of resources) {
      parts.push(`- ${res.name}: ${res.description ?? ""}`);
    }
  }

  const agencies = entitiesByType(publicEntities, "agency");
  if (agencies.length) {
    parts.push("\nAGENCIES:");
    for (const agency of agencies) {
      parts.push(`- ${agency.name}: ${agency.description ?? ""}`);
    }
  }

  if (publicRelationships.length) {
    parts.push("\nRELATIONSHIPS:");
    const entityMap = new Map(publicEntities.map((e) => [e.id, e]));
    for (const rel of publicRelationships) {
      const source = entityMap.get(rel.source_entity_id);
      const target = entityMap.get(rel.target_entity_id);
      if (source && target) {
        parts.push(
          `- ${source.name} ${rel.relationship_type.replace(/_/g, " ")} ${target.name}`
        );
      }
    }
  }

  return parts.join("\n").trim();
}
