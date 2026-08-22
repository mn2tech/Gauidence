import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CROSSROADS_ORG_SLUG } from "@/lib/knowledge-studio/constants";
import { formatEasternTimeRange } from "@/lib/knowledge-studio/formatTime";
import type {
  KnowledgeEventRow,
  KnowledgeFactRow,
} from "@/lib/knowledge-studio/types";

export type PublishedOrgKnowledge = {
  facts: KnowledgeFactRow[];
  events: KnowledgeEventRow[];
};

/**
 * Load published+public knowledge for an organization.
 * Safe for anon clients (RLS) or service role with explicit filters.
 */
export async function loadPublishedOrgKnowledge(
  supabase: SupabaseClient,
  organizationSlug: string = CROSSROADS_ORG_SLUG
): Promise<PublishedOrgKnowledge> {
  const [{ data: facts }, { data: events }] = await Promise.all([
    supabase
      .from("knowledge_facts")
      .select("*")
      .eq("organization_slug", organizationSlug)
      .eq("lifecycle_status", "published")
      .eq("visibility", "public")
      .order("updated_at", { ascending: false }),
    supabase
      .from("knowledge_events")
      .select("*")
      .eq("organization_slug", organizationSlug)
      .eq("lifecycle_status", "published")
      .eq("visibility", "public")
      .order("start_at", { ascending: true }),
  ]);

  return {
    facts: (facts ?? []) as KnowledgeFactRow[],
    events: (events ?? []) as KnowledgeEventRow[],
  };
}

export function formatPublishedKnowledgeForPrompt(
  knowledge: PublishedOrgKnowledge
): string {
  const parts: string[] = [];

  if (knowledge.facts.length) {
    parts.push("PUBLISHED ORGANIZATION FACTS:");
    for (const fact of knowledge.facts) {
      parts.push(
        [
          `- [${fact.category}] ${fact.title}`,
          `  ${fact.content}`,
          `  Source: ${fact.source_label ?? "CrossRoads Connect"}${
            fact.source_url ? ` — ${fact.source_url}` : ""
          }`,
        ].join("\n")
      );
    }
  }

  if (knowledge.events.length) {
    parts.push("PUBLISHED EVENTS:");
    for (const event of knowledge.events) {
      const when = formatEasternTimeRange(event.start_at, event.end_at);
      parts.push(
        [
          `- ${event.title}`,
          event.description ? `  Description: ${event.description}` : null,
          when ? `  When (America/New_York): ${when}` : null,
          event.location ? `  Location: ${event.location}` : null,
          event.cost ? `  Cost: ${event.cost}` : null,
          event.audience ? `  Audience: ${event.audience}` : null,
          event.contact ? `  Contact: ${event.contact}` : null,
          event.rsvp_url ? `  RSVP: ${event.rsvp_url}` : null,
          `  Source: ${event.source_label ?? "CrossRoads Connect"}${
            event.source_url ? ` — ${event.source_url}` : ""
          }`,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  }

  return parts.join("\n\n").trim();
}
