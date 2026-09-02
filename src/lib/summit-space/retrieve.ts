import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSourceAttribution } from "./sourceTypes";
import type {
  AgencyPageData,
  OpportunityPageData,
  OrganizationPageData,
  PublishedSummitKnowledge,
  ResourcePageData,
  SummitEntityRow,
  SummitRelationshipRow,
  SummitSpaceRow,
  TakeawayPageData,
  SessionPageData,
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

function entityMapFrom(
  entities: SummitEntityRow[]
): Map<string, SummitEntityRow> {
  return new Map(entities.map((e) => [e.id, e]));
}

export function relatedEntities(
  knowledge: PublishedSummitKnowledge,
  entityId: string,
  relationshipType?: string
): SummitEntityRow[] {
  const entityMap = entityMapFrom(knowledge.entities);
  const related: SummitEntityRow[] = [];
  const seen = new Set<string>();

  for (const rel of knowledge.relationships) {
    if (relationshipType && rel.relationship_type !== relationshipType) {
      continue;
    }
    if (rel.source_entity_id === entityId) {
      const target = entityMap.get(rel.target_entity_id);
      if (target && !seen.has(target.id)) {
        seen.add(target.id);
        related.push(target);
      }
    }
    if (rel.target_entity_id === entityId) {
      const source = entityMap.get(rel.source_entity_id);
      if (source && !seen.has(source.id)) {
        seen.add(source.id);
        related.push(source);
      }
    }
  }

  return related;
}

function relatedByType(
  knowledge: PublishedSummitKnowledge,
  entityId: string,
  entityType: string,
  relationshipType?: string
): SummitEntityRow[] {
  return relatedEntities(knowledge, entityId, relationshipType).filter(
    (e) => e.entity_type === entityType
  );
}

export function buildOrganizationPageData(
  knowledge: PublishedSummitKnowledge,
  orgSlug: string
): OrganizationPageData | null {
  const organization = entityBySlug(knowledge.entities, orgSlug);
  if (!organization || organization.entity_type !== "organization") {
    return null;
  }

  const entityMap = entityMapFrom(knowledge.entities);

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
        (r.target_entity_id === organization.id &&
          r.relationship_type === "mentions") ||
        (r.source_entity_id === organization.id &&
          r.relationship_type === "participates_in")
    )
    .map((r) =>
      entityMap.get(
        r.target_entity_id === organization.id
          ? r.source_entity_id
          : r.target_entity_id
      )
    )
    .filter((e): e is SummitEntityRow => !!e && e.entity_type === "session");

  const opportunities = relatedByType(
    knowledge,
    organization.id,
    "opportunity",
    "offers"
  );

  const agencies = relatedByType(knowledge, organization.id, "agency");
  const resources = relatedByType(knowledge, organization.id, "resource");

  const relatedEntitiesList = relatedEntities(knowledge, organization.id).filter(
    (e) => e.id !== organization.id
  );

  return {
    organization,
    speakers,
    sessions: [...new Map(sessions.map((s) => [s.id, s])).values()],
    opportunities,
    agencies,
    resources,
    relatedEntities: relatedEntitiesList,
  };
}

export function buildOpportunityPageData(
  knowledge: PublishedSummitKnowledge,
  oppSlug: string
): OpportunityPageData | null {
  const opportunity = entityBySlug(knowledge.entities, oppSlug);
  if (!opportunity || opportunity.entity_type !== "opportunity") {
    return null;
  }

  const props = opportunity.properties as Record<string, string>;
  const orgSlug = props.organization_slug;
  const organization = orgSlug
    ? entityBySlug(knowledge.entities, orgSlug) ?? null
    : null;

  const sessions = relatedByType(knowledge, opportunity.id, "session");
  const agencies = relatedByType(knowledge, opportunity.id, "agency");
  const resources = relatedByType(knowledge, opportunity.id, "resource");

  return {
    opportunity,
    organization,
    sessions,
    agencies,
    resources,
  };
}

export function buildAgencyPageData(
  knowledge: PublishedSummitKnowledge,
  agencySlug: string
): AgencyPageData | null {
  const agency = entityBySlug(knowledge.entities, agencySlug);
  if (!agency || agency.entity_type !== "agency") {
    return null;
  }

  const sessions = relatedByType(knowledge, agency.id, "session");
  const organizations = relatedByType(knowledge, agency.id, "organization");
  const opportunities = relatedByType(knowledge, agency.id, "opportunity");
  const resources = relatedByType(knowledge, agency.id, "resource", "supports");

  return {
    agency,
    sessions,
    organizations,
    opportunities,
    resources,
  };
}

export function buildResourcePageData(
  knowledge: PublishedSummitKnowledge,
  resourceSlug: string
): ResourcePageData | null {
  const resource = entityBySlug(knowledge.entities, resourceSlug);
  if (!resource || resource.entity_type !== "resource") {
    return null;
  }

  const agencies = relatedByType(
    knowledge,
    resource.id,
    "agency",
    "supports"
  );
  const opportunities = relatedByType(knowledge, resource.id, "opportunity");

  return { resource, agencies, opportunities };
}

export function buildTakeawayPageData(
  knowledge: PublishedSummitKnowledge,
  takeawaySlug: string
): TakeawayPageData | null {
  const takeaway = entityBySlug(knowledge.entities, takeawaySlug);
  if (
    !takeaway ||
    takeaway.entity_type !== "action_item" ||
    (takeaway.properties as Record<string, string>).category !== "takeaway"
  ) {
    return null;
  }

  const sessions = relatedByType(knowledge, takeaway.id, "session");
  const organizations = relatedByType(knowledge, takeaway.id, "organization");

  return { takeaway, sessions, organizations };
}

export function buildSessionPageData(
  knowledge: PublishedSummitKnowledge,
  sessionSlug: string
): SessionPageData | null {
  const session = entityBySlug(knowledge.entities, sessionSlug);
  if (!session || session.entity_type !== "session") {
    return null;
  }

  const entityMap = entityMapFrom(knowledge.entities);

  const speakers = knowledge.relationships
    .filter(
      (r) =>
        r.target_entity_id === session.id && r.relationship_type === "spoke_at"
    )
    .map((r) => entityMap.get(r.source_entity_id))
    .filter((e): e is SummitEntityRow => !!e && e.entity_type === "person");

  const organizations = knowledge.relationships
    .filter(
      (r) =>
        r.source_entity_id === session.id && r.relationship_type === "mentions"
    )
    .map((r) => entityMap.get(r.target_entity_id))
    .filter(
      (e): e is SummitEntityRow => !!e && e.entity_type === "organization"
    );

  const opportunities = relatedByType(knowledge, session.id, "opportunity");

  return { session, speakers, organizations, opportunities };
}

function formatEntityBlock(
  entity: SummitEntityRow,
  extraLines: string[] = []
): string {
  const attribution = formatSourceAttribution(entity.source_type);
  const lines = [
    `- ${entity.name} [slug: ${entity.slug ?? "n/a"}]`,
    entity.description ? `  ${entity.description}` : null,
    ...extraLines.map((l) => `  ${l}`),
    entity.source_label ? `  Source: ${entity.source_label}` : null,
    `  Attribution: ${attribution}`,
  ].filter(Boolean);
  return lines.join("\n");
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
    parts.push("\nORGANIZATIONS:");
    for (const org of orgs) {
      const props = org.properties as Record<string, string | string[]>;
      const extra: string[] = [];
      if (props.role) extra.push(`Role: ${props.role}`);
      if (props.division) extra.push(`Division: ${props.division}`);
      if (props.small_business_engagement) {
        extra.push(`Small business engagement: ${props.small_business_engagement}`);
      }
      if (props.federal_focus) extra.push(`Federal focus: ${props.federal_focus}`);
      if (props.engagement_path) extra.push(`Engagement path: ${props.engagement_path}`);
      parts.push(formatEntityBlock(org, extra));
    }
  }

  const people = entitiesByType(publicEntities, "person");
  if (people.length) {
    parts.push("\nSPEAKERS:");
    for (const person of people) {
      const props = person.properties as Record<string, string>;
      const extra: string[] = [];
      if (props.title) extra.push(`Title: ${props.title}`);
      if (props.organization) extra.push(`Organization: ${props.organization}`);
      parts.push(formatEntityBlock(person, extra));
    }
  }

  const sessions = entitiesByType(publicEntities, "session");
  if (sessions.length) {
    parts.push("\nSESSIONS:");
    for (const session of sessions) {
      parts.push(formatEntityBlock(session));
    }
  }

  const opportunities = entitiesByType(publicEntities, "opportunity");
  if (opportunities.length) {
    parts.push("\nOPPORTUNITIES:");
    for (const opp of opportunities) {
      const props = opp.properties as Record<string, string | string[]>;
      const extra: string[] = [];
      if (props.opportunity_type) extra.push(`Type: ${props.opportunity_type}`);
      if (props.organization_slug) {
        extra.push(`Related organization slug: ${props.organization_slug}`);
      }
      if (props.why_it_matters) extra.push(`Why it matters: ${props.why_it_matters}`);
      if (props.recommended_next_step) {
        extra.push(`Recommended next step: ${props.recommended_next_step}`);
      }
      if (Array.isArray(props.capability_areas)) {
        extra.push(`Capability areas: ${props.capability_areas.join(", ")}`);
      }
      parts.push(formatEntityBlock(opp, extra));
    }
  }

  const agencies = entitiesByType(publicEntities, "agency");
  if (agencies.length) {
    parts.push("\nAGENCIES:");
    for (const agency of agencies) {
      const props = agency.properties as Record<string, string>;
      const extra: string[] = [];
      if (props.why_it_matters) extra.push(`Why it matters: ${props.why_it_matters}`);
      if (props.official_resource_url) {
        extra.push(`Official resource: ${props.official_resource_url}`);
      }
      parts.push(formatEntityBlock(agency, extra));
    }
  }

  const resources = entitiesByType(publicEntities, "resource");
  if (resources.length) {
    parts.push("\nRESOURCES:");
    for (const res of resources) {
      const props = res.properties as Record<string, string>;
      const extra: string[] = [];
      if (props.who_should_use) extra.push(`Who should use: ${props.who_should_use}`);
      if (props.why_it_matters) extra.push(`Why it matters: ${props.why_it_matters}`);
      if (props.official_url) extra.push(`Official URL: ${props.official_url}`);
      parts.push(formatEntityBlock(res, extra));
    }
  }

  const takeaways = publicEntities.filter(
    (e) =>
      e.entity_type === "action_item" &&
      (e.properties as Record<string, string>).category === "takeaway"
  );
  if (takeaways.length) {
    parts.push("\nSUMMIT TAKEAWAYS:");
    for (const t of takeaways) {
      parts.push(formatEntityBlock(t));
    }
  }

  if (publicRelationships.length) {
    parts.push("\nRELATIONSHIPS (verified only — do not invent additional links):");
    const entityMap = entityMapFrom(publicEntities);
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
