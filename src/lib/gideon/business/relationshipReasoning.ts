import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ONTOLOGY_ENTITY_SELECT,
  ONTOLOGY_RELATIONSHIP_SELECT,
  ONTOLOGY_VISIBLE_REVIEW_STATUSES,
  type OntologyEntity,
  type OntologyRelationship,
} from "@/lib/ontology/types";
import { formatMoney } from "@/lib/proposals/pricing";
import { PROPOSAL_SELECT } from "@/lib/proposals/types";
import { mapProposalRow } from "@/lib/proposals/server";
import { shouldExcludeFromBusinessOntology } from "./knowledgeFilter";
import { proposalTitleWithoutClientPrefix } from "./displayNames";
import type { GideonClaim } from "./types";

export type ClientsWithoutActiveProjectResult = {
  lines: string[];
  claims: GideonClaim[];
};

export { proposalTitleWithoutClientPrefix } from "./displayNames";

async function loadClientProfileNames(
  supabase: SupabaseClient,
  clientIds: string[],
  known: Record<string, string>
): Promise<Record<string, string>> {
  const names: Record<string, string> = { ...known };
  const missing = [
    ...new Set(clientIds.filter((id) => id && !names[id]?.trim())),
  ];
  if (!missing.length) return names;

  const { data } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .in("id", missing);
  for (const row of data ?? []) {
    const id = String(row.id);
    const display = String(row.display_name ?? "").trim();
    if (display) names[id] = display;
  }
  return names;
}

/**
 * Clients that have proposals but no active ontology project.
 * Ontology-first; structured proposals fill commercial detail.
 */
export async function findClientsWithProposalsWithoutActiveProject(
  supabase: SupabaseClient,
  args: {
    spaceIds: string[];
    businessProfileId: string;
    profileNames: Record<string, string>;
  }
): Promise<ClientsWithoutActiveProjectResult> {
  const [{ data: clientEntities }, { data: projectRels }, { data: proposalRows }] =
    await Promise.all([
      supabase
        .from("ontology_entities")
        .select(ONTOLOGY_ENTITY_SELECT)
        .in("profile_id", args.spaceIds)
        .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
        .in("entity_type", ["client", "organization"])
        .limit(80),
      supabase
        .from("ontology_relationships")
        .select(ONTOLOGY_RELATIONSHIP_SELECT)
        .in("profile_id", args.spaceIds)
        .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
        .in("relationship_type", ["HAS_PROJECT", "WORKS_ON", "PROPOSED_TO"])
        .limit(200),
      supabase
        .from("proposals")
        .select(PROPOSAL_SELECT)
        .eq("business_profile_id", args.businessProfileId)
        .in("status", ["sent", "viewed", "changes_requested", "draft", "accepted"])
        .order("updated_at", { ascending: false })
        .limit(60),
    ]);

  const entities = ((clientEntities as OntologyEntity[] | null) ?? []).filter(
    (e) =>
      !shouldExcludeFromBusinessOntology({
        name: e.name,
        description: e.description,
        entityType: e.entity_type,
      })
  );
  const relationships = (projectRels as OntologyRelationship[] | null) ?? [];
  const proposals = (proposalRows ?? []).map((row) => mapProposalRow(row));

  const profileNames = await loadClientProfileNames(
    supabase,
    proposals.map((p) => p.client_profile_id),
    args.profileNames
  );

  const projectEntityIds = new Set<string>();
  const { data: projects } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .in("profile_id", args.spaceIds)
    .eq("entity_type", "project")
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .limit(100);

  for (const p of (projects as OntologyEntity[] | null) ?? []) {
    const status =
      typeof p.properties?.status === "string"
        ? p.properties.status.toLowerCase()
        : "active";
    if (status === "active" || status === "in_progress" || !p.properties?.status) {
      projectEntityIds.add(p.id);
    }
  }

  const clientsWithActiveProject = new Set<string>();
  for (const rel of relationships) {
    if (
      (rel.relationship_type === "HAS_PROJECT" ||
        rel.relationship_type === "WORKS_ON") &&
      projectEntityIds.has(rel.target_entity_id)
    ) {
      clientsWithActiveProject.add(rel.source_entity_id);
    }
  }

  const lines: string[] = [];
  const claims: GideonClaim[] = [];

  // Group by client profile id so missing names don't collapse everyone into one bucket.
  const byClient = new Map<
    string,
    {
      name: string;
      props: Array<{ id: string; title: string; amount: string; status: string }>;
    }
  >();
  for (const p of proposals) {
    if (p.status === "accepted" && p.work_project_id) continue;
    const clientId = p.client_profile_id || `unknown:${p.id}`;
    const clientName =
      profileNames[p.client_profile_id]?.trim() || "Unknown client";
    const entry = byClient.get(clientId) ?? { name: clientName, props: [] };
    entry.name = clientName;
    entry.props.push({
      id: p.id,
      title: proposalTitleWithoutClientPrefix(p.title, clientName),
      amount: formatMoney(p.total_cents, p.currency),
      status: p.status,
    });
    byClient.set(clientId, entry);
  }

  // Drop clients that clearly have an ontology active project with matching name
  for (const [clientId, { name: clientName, props }] of byClient) {
    const matchedEntity = entities.find(
      (e) => e.name.toLowerCase() === clientName.toLowerCase()
    );
    if (matchedEntity && clientsWithActiveProject.has(matchedEntity.id)) {
      byClient.delete(clientId);
      continue;
    }
    const block = [
      clientName,
      ...props
        .slice(0, 3)
        .map((p) => `  ${p.title} — ${p.amount} (${p.status})`),
    ].join("\n");
    lines.push(block);
    for (const p of props.slice(0, 2)) {
      claims.push({
        claim: `${clientName} has proposal "${p.title}" (${p.amount}) and Guardian does not show an active linked project.`,
        kind: "KNOWN_FACT",
        confidence: 0.7,
        evidence: [
          {
            sourceId: p.id,
            sourceType: "proposal",
            label: p.title,
            href: `/proposals/${p.id}`,
            reference: "Proposal without active project link",
          },
        ],
      });
    }
  }

  if (!lines.length) {
    lines.push(
      "Based on available evidence, I could not find clients that have proposals without an active project."
    );
  } else {
    const n = byClient.size;
    lines.unshift(
      `${n} client${n === 1 ? "" : "s"} appear${n === 1 ? "s" : ""} to have proposals without an active project:`
    );
  }

  return { lines, claims };
}

/**
 * Relationship traversal for an entity mention (e.g. Onyx).
 */
export async function describeEntityRelationships(
  supabase: SupabaseClient,
  args: {
    spaceIds: string[];
    mention: string;
  }
): Promise<{ lines: string[]; claims: GideonClaim[] }> {
  const { resolveBusinessEntity } = await import("./entity360");
  const resolved = await resolveBusinessEntity(supabase, {
    spaceIds: args.spaceIds,
    mention: args.mention,
  });
  if (!resolved) {
    return {
      lines: [
        `I could not find an entity matching "${args.mention}" in Guardian's ontology.`,
      ],
      claims: [],
    };
  }

  const { data: outgoing } = await supabase
    .from("ontology_relationships")
    .select(ONTOLOGY_RELATIONSHIP_SELECT)
    .eq("source_entity_id", resolved.entity.id)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .limit(30);
  const { data: incoming } = await supabase
    .from("ontology_relationships")
    .select(ONTOLOGY_RELATIONSHIP_SELECT)
    .eq("target_entity_id", resolved.entity.id)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .limit(30);

  const rels = [
    ...((outgoing as OntologyRelationship[] | null) ?? []),
    ...((incoming as OntologyRelationship[] | null) ?? []),
  ];
  const otherIds = [
    ...new Set(
      rels.flatMap((r) =>
        r.source_entity_id === resolved.entity.id
          ? [r.target_entity_id]
          : [r.source_entity_id]
      )
    ),
  ];
  const nameMap = new Map<string, OntologyEntity>();
  if (otherIds.length) {
    const { data } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("id", otherIds)
      .neq("review_status", "rejected");
    for (const e of (data as OntologyEntity[] | null) ?? []) {
      nameMap.set(e.id, e);
    }
  }

  const lines: string[] = [
    `Relationships involving ${resolved.entity.name}:`,
  ];
  const claims: GideonClaim[] = [];

  for (const rel of rels.slice(0, 15)) {
    const otherId =
      rel.source_entity_id === resolved.entity.id
        ? rel.target_entity_id
        : rel.source_entity_id;
    const other = nameMap.get(otherId);
    if (!other) continue;
    if (
      shouldExcludeFromBusinessOntology({
        name: other.name,
        description: other.description,
        entityType: other.entity_type,
      })
    ) {
      continue;
    }
    const left =
      rel.source_entity_id === resolved.entity.id
        ? resolved.entity.name
        : other.name;
    const right =
      rel.source_entity_id === resolved.entity.id
        ? other.name
        : resolved.entity.name;
    const line = `${left} —[${rel.relationship_type}]→ ${right}`;
    lines.push(`• ${line}`);
    claims.push({
      claim: line,
      kind: "KNOWN_FACT",
      confidence: rel.confidence != null ? Number(rel.confidence) : 0.7,
      evidence: [
        {
          sourceId: rel.id,
          sourceType: "ontology_relationship",
          label: `${rel.relationship_type}`,
          reference: other.name,
        },
      ],
    });
  }

  if (lines.length === 1) {
    lines.push(
      "Guardian currently shows no ontology relationships for this entity."
    );
  }

  return { lines, claims };
}
