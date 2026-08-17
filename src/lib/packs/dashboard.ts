import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GUARDIAN_BUSINESS_PACK_SLUG,
  GUARDIAN_DENTAL_PACK_SLUG,
} from "./types";
import type { PackDashboardCard, DashboardCardData } from "./types";
import { getInstalledPack } from "./catalog";

export type { DashboardCardData };

const STALE_PROPOSAL_DAYS = 7;
const EXPIRING_CONTRACT_DAYS = 90;

const DATE_PROPERTY_KEYS = [
  "expires_at",
  "expiration_date",
  "expiry_date",
  "end_date",
  "contract_end",
  "ends_on",
  "due_date",
  "expiry",
  "expiration",
];

async function resolvePackSpaceIds(
  supabase: SupabaseClient,
  profileId: string
): Promise<string[]> {
  const spaceIds = new Set<string>([profileId]);
  const { data: children } = await supabase
    .from("guardian_profiles")
    .select("id")
    .eq("parent_profile_id", profileId);
  for (const child of children ?? []) {
    spaceIds.add(String(child.id));
  }
  return Array.from(spaceIds);
}

function askHref(profileId: string, question: string): string {
  const params = new URLSearchParams({
    profileId,
    draft: question,
  });
  return `/ask?${params.toString()}`;
}

function parsePropertyDate(
  properties: Record<string, unknown> | null | undefined
): Date | null {
  if (!properties || typeof properties !== "object") return null;
  for (const key of DATE_PROPERTY_KEYS) {
    const raw = properties[key];
    if (raw == null) continue;
    const text = String(raw).trim();
    if (!text) continue;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  // Free-form scan of string values that look like ISO dates.
  for (const value of Object.values(properties)) {
    if (typeof value !== "string") continue;
    const match = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (!match) continue;
    const parsed = new Date(match[1]!);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function withAsk(
  card: DashboardCardData,
  profileId: string,
  question: string
): DashboardCardData {
  return {
    ...card,
    askQuestion: question,
    askHref: askHref(profileId, question),
  };
}

/** Default Business Pack cards when catalog config is thin or outdated. */
function ensureBusinessCardDefs(
  cardsDef: PackDashboardCard[]
): PackDashboardCard[] {
  const byKey = new Map(cardsDef.map((c) => [c.key, c]));
  const defaults: PackDashboardCard[] = [
    {
      key: "follow_ups",
      title: "Needs follow-up",
      source: "follow_ups",
      empty: "Nothing urgent in open proposals or tasks right now.",
    },
    {
      key: "clients",
      title: "Clients",
      entityTypes: ["client", "organization"],
      empty:
        "Connect or analyze business knowledge to discover your clients.",
    },
    {
      key: "open_proposals",
      title: "Open Proposals",
      source: "proposals",
      empty: "No open proposals yet.",
    },
    {
      key: "expiring_contracts",
      title: "Contracts expiring soon",
      source: "expiring_contracts",
      entityTypes: ["contract"],
      empty: "No contract end dates found in the next 90 days.",
    },
    {
      key: "contracts",
      title: "Contracts",
      entityTypes: ["contract"],
      empty: "Analyze contracts to track agreements.",
    },
    {
      key: "active_projects",
      title: "Active Projects",
      entityTypes: ["project"],
      empty: "Analyze proposals and documents to discover projects.",
    },
    {
      key: "tasks",
      title: "Tasks",
      entityTypes: ["task"],
      empty: "No tasks discovered yet.",
    },
    {
      key: "recent_knowledge",
      title: "Recent Knowledge",
      source: "recent_evidence",
      empty: "Analyze existing knowledge to populate this feed.",
    },
    {
      key: "ontology_health",
      title: "Ontology Health",
      source: "ontology_stats",
      empty: "Install and analyze to build your business ontology.",
    },
  ];

  const ordered: PackDashboardCard[] = [];
  for (const def of defaults) {
    ordered.push(byKey.get(def.key) ?? def);
    byKey.delete(def.key);
  }
  for (const leftover of byKey.values()) {
    ordered.push(leftover);
  }
  return ordered;
}

/** Default Dental Pack cards when catalog config is thin. */
function ensureDentalCardDefs(
  cardsDef: PackDashboardCard[]
): PackDashboardCard[] {
  const byKey = new Map(cardsDef.map((c) => [c.key, c]));
  const defaults: PackDashboardCard[] = [
    {
      key: "follow_ups",
      title: "Needs follow-up",
      source: "follow_ups",
      empty: "Nothing urgent in tasks or claims right now.",
    },
    {
      key: "patients",
      title: "Patients",
      entityTypes: ["patient"],
      empty: "Analyze clinical and patient docs to discover patients.",
    },
    {
      key: "appointments",
      title: "Appointments",
      entityTypes: ["appointment"],
      empty: "Analyze scheduling materials to discover appointments.",
    },
    {
      key: "treatment_plans",
      title: "Treatment plans",
      entityTypes: ["treatment_plan"],
      empty: "Analyze clinical docs to discover treatment plans.",
    },
    {
      key: "claims",
      title: "Insurance claims",
      entityTypes: ["claim"],
      empty: "Analyze insurance docs to track claims.",
    },
    {
      key: "providers",
      title: "Providers",
      entityTypes: ["provider"],
      empty: "Analyze team materials to discover providers.",
    },
    {
      key: "lab_cases",
      title: "Lab cases",
      entityTypes: ["lab_case"],
      empty: "No lab cases discovered yet.",
    },
    {
      key: "tasks",
      title: "Tasks",
      entityTypes: ["task"],
      empty: "No tasks discovered yet.",
    },
    {
      key: "recent_knowledge",
      title: "Recent Knowledge",
      source: "recent_evidence",
      empty: "Analyze existing knowledge to populate this feed.",
    },
    {
      key: "ontology_health",
      title: "Ontology Health",
      source: "ontology_stats",
      empty: "Install and analyze to build your dental ontology.",
    },
  ];

  const ordered: PackDashboardCard[] = [];
  for (const def of defaults) {
    ordered.push(byKey.get(def.key) ?? def);
    byKey.delete(def.key);
  }
  for (const leftover of byKey.values()) {
    ordered.push(leftover);
  }
  return ordered;
}

function ensurePackCardDefs(
  packSlug: string,
  cardsDef: PackDashboardCard[]
): PackDashboardCard[] {
  if (packSlug === GUARDIAN_BUSINESS_PACK_SLUG) {
    return ensureBusinessCardDefs(cardsDef);
  }
  if (packSlug === GUARDIAN_DENTAL_PACK_SLUG) {
    return ensureDentalCardDefs(cardsDef);
  }
  return cardsDef;
}

/**
 * Build Pack dashboard cards from real ontology/proposal data.
 * Never fabricates metrics — empty states when counts are zero.
 */
export async function buildPackDashboard(
  supabase: SupabaseClient,
  profileId: string,
  packSlug: string
): Promise<{
  packName: string;
  version: string;
  summary: {
    clients: number;
    openProposals: number;
    followUps: number;
    expiringContracts: number;
    entities: number;
  };
  cards: DashboardCardData[];
} | null> {
  const installed = await getInstalledPack(supabase, profileId, packSlug);
  if (!installed) return null;

  const spaceIds = await resolvePackSpaceIds(supabase, profileId);
  const cardsDef = ensurePackCardDefs(
    packSlug,
    installed.definition.dashboard?.cards ?? []
  );
  const cards: DashboardCardData[] = [];
  const now = new Date();
  const ontologyHref = `/settings/packs/${packSlug}/ontology?profileId=${encodeURIComponent(profileId)}`;

  let summaryClients = 0;
  let summaryOpenProposals = 0;
  let summaryFollowUps = 0;
  let summaryExpiring = 0;
  let summaryEntities = 0;

  for (const card of cardsDef) {
    if (card.source === "follow_ups" || card.key === "follow_ups") {
      const staleBefore = new Date(
        now.getTime() - STALE_PROPOSAL_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      const isDental = packSlug === GUARDIAN_DENTAL_PACK_SLUG;
      const [{ data: staleProposals }, { data: tasks }, { data: claims }] =
        await Promise.all([
          isDental
            ? Promise.resolve({ data: [] as Array<{
                id: string;
                title: string | null;
                status: string | null;
                updated_at: string;
              }> })
            : supabase
                .from("proposals")
                .select("id, title, status, updated_at")
                .eq("business_profile_id", profileId)
                .in("status", ["sent", "viewed", "changes_requested"])
                .lt("updated_at", staleBefore)
                .order("updated_at", { ascending: true })
                .limit(8),
          supabase
            .from("ontology_entities")
            .select("id, name, profile_id, updated_at")
            .in("profile_id", spaceIds)
            .eq("entity_type", "task")
            .neq("review_status", "rejected")
            .order("updated_at", { ascending: false })
            .limit(5),
          isDental
            ? supabase
                .from("ontology_entities")
                .select("id, name, profile_id, updated_at")
                .in("profile_id", spaceIds)
                .eq("entity_type", "claim")
                .neq("review_status", "rejected")
                .order("updated_at", { ascending: false })
                .limit(5)
            : Promise.resolve({ data: [] as Array<{
                id: string;
                name: string;
                profile_id: string;
                updated_at: string;
              }> }),
        ]);

      const items: DashboardCardData["items"] = [];
      for (const p of staleProposals ?? []) {
        const age = daysBetween(new Date(String(p.updated_at)), now);
        items.push({
          id: `proposal:${p.id}`,
          label: String(p.title ?? "Proposal"),
          meta: `${p.status} · ${age}d since update`,
          href: `/proposals/${p.id}`,
        });
      }
      for (const c of claims ?? []) {
        items.push({
          id: `claim:${c.id}`,
          label: String(c.name),
          meta: "insurance claim",
          href: `${ontologyHref}&entityId=${c.id}`,
        });
      }
      for (const t of tasks ?? []) {
        items.push({
          id: `task:${t.id}`,
          label: String(t.name),
          meta: "ontology task",
          href: `${ontologyHref}&entityId=${t.id}`,
        });
      }

      summaryFollowUps = items.length;
      cards.push(
        withAsk(
          {
            key: card.key,
            title: card.title,
            count: items.length,
            items: items.slice(0, 6),
            empty: card.empty,
            tone: items.length > 0 ? "attention" : "neutral",
            detail:
              items.length > 0
                ? isDental
                  ? "Insurance claims and ontology tasks needing attention"
                  : `Open proposals idle ${STALE_PROPOSAL_DAYS}+ days, plus ontology tasks`
                : undefined,
          },
          profileId,
          isDental
            ? "What should I follow up on today?"
            : "What should I follow up on?"
        )
      );
      continue;
    }

    if (card.source === "proposals" || card.key === "open_proposals") {
      const { data, count } = await supabase
        .from("proposals")
        .select("id, title, status, updated_at", { count: "exact" })
        .eq("business_profile_id", profileId)
        .in("status", ["draft", "sent", "viewed", "changes_requested"])
        .order("updated_at", { ascending: false })
        .limit(6);

      summaryOpenProposals = count ?? (data?.length ?? 0);
      cards.push(
        withAsk(
          {
            key: card.key,
            title: card.title,
            count: summaryOpenProposals,
            items: (data ?? []).map((p) => ({
              id: String(p.id),
              label: String(p.title ?? "Proposal"),
              meta: String(p.status),
              href: `/proposals/${p.id}`,
            })),
            empty: card.empty,
          },
          profileId,
          "What proposals are outstanding?"
        )
      );
      continue;
    }

    if (
      card.source === "expiring_contracts" ||
      card.key === "expiring_contracts"
    ) {
      type ContractRow = {
        id: string;
        name: string | null;
        properties: Record<string, unknown> | null;
      };

      const { data } = await supabase
        .from("ontology_entities")
        .select("id, name, properties, updated_at")
        .in("profile_id", spaceIds)
        .eq("entity_type", "contract")
        .neq("review_status", "rejected")
        .limit(100);

      const horizon = new Date(
        now.getTime() + EXPIRING_CONTRACT_DAYS * 24 * 60 * 60 * 1000
      );
      const expiring = ((data ?? []) as ContractRow[])
        .map((row) => ({
          row,
          end: parsePropertyDate(row.properties),
        }))
        .filter(
          (x): x is { row: ContractRow; end: Date } =>
            x.end != null && x.end >= now && x.end <= horizon
        )
        .sort((a, b) => a.end.getTime() - b.end.getTime());

      summaryExpiring = expiring.length;
      cards.push(
        withAsk(
          {
            key: card.key,
            title: card.title,
            count: expiring.length,
            items: expiring.slice(0, 6).map(({ row, end }) => ({
              id: String(row.id),
              label: String(row.name),
              meta: `ends ${formatShortDate(end)}`,
              href: `${ontologyHref}&entityId=${row.id}`,
            })),
            empty: card.empty,
            tone: expiring.length > 0 ? "attention" : "neutral",
            detail:
              expiring.length > 0
                ? `Within the next ${EXPIRING_CONTRACT_DAYS} days`
                : undefined,
          },
          profileId,
          "What contracts expire in the next 90 days?"
        )
      );
      continue;
    }

    if (card.source === "ontology_stats" || card.key === "ontology_health") {
      const [entities, relationships, evidence, pending] = await Promise.all([
        supabase
          .from("ontology_entities")
          .select("id", { count: "exact", head: true })
          .in("profile_id", spaceIds)
          .neq("review_status", "rejected"),
        supabase
          .from("ontology_relationships")
          .select("id", { count: "exact", head: true })
          .in("profile_id", spaceIds)
          .neq("review_status", "rejected"),
        supabase
          .from("ontology_evidence")
          .select("id", { count: "exact", head: true })
          .in("profile_id", spaceIds),
        supabase
          .from("ontology_entities")
          .select("id", { count: "exact", head: true })
          .in("profile_id", spaceIds)
          .eq("review_status", "pending"),
      ]);

      const entityCount = entities.count ?? 0;
      summaryEntities = entityCount;
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
            href: ontologyHref,
          },
        ],
        empty: card.empty,
        detail:
          entityCount === 0
            ? card.empty
            : `${entityCount} entities across this Space and child Spaces`,
        askHref: ontologyHref,
        askQuestion: "Open ontology explorer",
      });
      continue;
    }

    if (card.source === "recent_evidence" || card.key === "recent_knowledge") {
      const { data } = await supabase
        .from("ontology_evidence")
        .select("id, evidence_text, created_at, document_id")
        .in("profile_id", spaceIds)
        .order("created_at", { ascending: false })
        .limit(6);

      const recentAsk =
        packSlug === GUARDIAN_DENTAL_PACK_SLUG
          ? "What recent knowledge did we learn about this practice?"
          : "What recent knowledge did we learn about this business?";

      cards.push(
        withAsk(
          {
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
                : ontologyHref,
            })),
            empty: card.empty,
          },
          profileId,
          recentAsk
        )
      );
      continue;
    }

    const entityTypes = card.entityTypes ?? [];
    if (entityTypes.length) {
      // Clients card: prefer client type, fall back to organizations.
      const types =
        card.key === "clients"
          ? ["client", "organization"]
          : entityTypes;

      const { data, count } = await supabase
        .from("ontology_entities")
        .select("id, name, entity_type, updated_at", { count: "exact" })
        .in("profile_id", spaceIds)
        .in("entity_type", types)
        .neq("review_status", "rejected")
        .order("updated_at", { ascending: false })
        .limit(6);

      // Prefer named clients over generic orgs when both exist.
      const ranked = [...(data ?? [])].sort((a, b) => {
        const score = (t: string) => (t === "client" ? 0 : 1);
        return score(String(a.entity_type)) - score(String(b.entity_type));
      });

      if (card.key === "clients" || card.key === "patients") {
        summaryClients = count ?? ranked.length;
      }

      const askByKey: Record<string, string> = {
        clients: "What clients are we currently working with?",
        patients: "Which patients have upcoming appointments?",
        contracts: "What contracts do we have?",
        active_projects: "What projects are associated with this business?",
        appointments: "What appointments are scheduled this week?",
        treatment_plans: "Which treatment plans are incomplete?",
        claims: "What insurance claims need follow-up?",
        providers: "Who are our providers?",
        lab_cases: "What lab cases are outstanding?",
        tasks: "What tasks need attention?",
      };

      cards.push(
        withAsk(
          {
            key: card.key,
            title: card.title,
            count: count ?? ranked.length,
            items: ranked.slice(0, 6).map((e) => ({
              id: String(e.id),
              label: String(e.name),
              meta: String(e.entity_type),
              href: `${ontologyHref}&entityId=${e.id}`,
            })),
            empty: card.empty,
          },
          profileId,
          askByKey[card.key] ?? `Tell me about our ${card.title.toLowerCase()}.`
        )
      );
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

  if (summaryEntities === 0) {
    const { count } = await supabase
      .from("ontology_entities")
      .select("id", { count: "exact", head: true })
      .in("profile_id", spaceIds)
      .neq("review_status", "rejected");
    summaryEntities = count ?? 0;
  }

  return {
    packName: installed.definition.pack.name,
    version: installed.definition.version.version,
    summary: {
      clients: summaryClients,
      openProposals: summaryOpenProposals,
      followUps: summaryFollowUps,
      expiringContracts: summaryExpiring,
      entities: summaryEntities,
    },
    cards,
  };
}
