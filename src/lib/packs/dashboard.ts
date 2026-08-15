import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getInstalledPack } from "./catalog";
import type { PackDashboardCard, DashboardCardData } from "./types";

export type { DashboardCardData };

/**
 * Build Business Pack dashboard cards from real ontology/proposal data.
 * Never fabricates metrics — empty states when counts are zero.
 */
export async function buildPackDashboard(
  supabase: SupabaseClient,
  profileId: string,
  packSlug: string
): Promise<{
  packName: string;
  version: string;
  cards: DashboardCardData[];
} | null> {
  const installed = await getInstalledPack(supabase, profileId, packSlug);
  if (!installed) return null;

  const cardsDef: PackDashboardCard[] =
    installed.definition.dashboard?.cards ?? [];

  const cards: DashboardCardData[] = [];

  for (const card of cardsDef) {
    if (card.source === "proposals" || card.key === "open_proposals") {
      const { data, count } = await supabase
        .from("proposals")
        .select("id, title, status", { count: "exact" })
        .eq("business_profile_id", profileId)
        .in("status", ["draft", "sent", "viewed"])
        .order("updated_at", { ascending: false })
        .limit(5);

      cards.push({
        key: card.key,
        title: card.title,
        count: count ?? (data?.length ?? 0),
        items: (data ?? []).map((p) => ({
          id: String(p.id),
          label: String(p.title ?? "Proposal"),
          href: `/proposals/${p.id}`,
        })),
        empty: card.empty,
      });
      continue;
    }

    if (card.source === "ontology_stats" || card.key === "ontology_health") {
      const [entities, relationships, evidence, pending] = await Promise.all([
        supabase
          .from("ontology_entities")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .neq("review_status", "rejected"),
        supabase
          .from("ontology_relationships")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .neq("review_status", "rejected"),
        supabase
          .from("ontology_evidence")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId),
        supabase
          .from("ontology_entities")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .eq("review_status", "pending"),
      ]);

      const entityCount = entities.count ?? 0;
      cards.push({
        key: card.key,
        title: card.title,
        count: entityCount,
        items: [
          { id: "entities", label: `${entityCount} entities` },
          {
            id: "relationships",
            label: `${relationships.count ?? 0} relationships`,
          },
          { id: "evidence", label: `${evidence.count ?? 0} evidence links` },
          {
            id: "pending",
            label: `${pending.count ?? 0} pending review`,
          },
        ],
        empty: card.empty,
        detail:
          entityCount === 0
            ? card.empty
            : `${entityCount} entities · ${relationships.count ?? 0} relationships`,
      });
      continue;
    }

    if (card.source === "recent_evidence" || card.key === "recent_knowledge") {
      const { data } = await supabase
        .from("ontology_evidence")
        .select("id, evidence_text, created_at, document_id")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(5);

      cards.push({
        key: card.key,
        title: card.title,
        count: data?.length ?? 0,
        items: (data ?? []).map((e) => ({
          id: String(e.id),
          label:
            (e.evidence_text as string | null)?.slice(0, 80) ||
            "Evidence excerpt",
          href: e.document_id
            ? `/documents/${e.document_id}`
            : `/settings/packs/${packSlug}/ontology?profileId=${profileId}`,
        })),
        empty: card.empty,
      });
      continue;
    }

    const entityTypes = card.entityTypes ?? [];
    if (entityTypes.length) {
      const { data, count } = await supabase
        .from("ontology_entities")
        .select("id, name, entity_type", { count: "exact" })
        .eq("profile_id", profileId)
        .in("entity_type", entityTypes)
        .neq("review_status", "rejected")
        .order("updated_at", { ascending: false })
        .limit(5);

      cards.push({
        key: card.key,
        title: card.title,
        count: count ?? (data?.length ?? 0),
        items: (data ?? []).map((e) => ({
          id: String(e.id),
          label: String(e.name),
          href: `/settings/packs/${packSlug}/ontology?profileId=${profileId}&entityId=${e.id}`,
        })),
        empty: card.empty,
      });
      continue;
    }

    cards.push({
      key: card.key,
      title: card.title,
      count: 0,
      items: [],
      empty: card.empty,
    });
  }

  return {
    packName: installed.definition.pack.name,
    version: installed.definition.version.version,
    cards,
  };
}
