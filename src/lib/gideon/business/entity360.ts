import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEntityGraph } from "@/lib/ontology/query";
import { normalizeEntityName } from "@/lib/ontology/normalize";
import {
  ONTOLOGY_ENTITY_SELECT,
  ONTOLOGY_VISIBLE_REVIEW_STATUSES,
  type OntologyEntity,
} from "@/lib/ontology/types";
import { formatMoney } from "@/lib/proposals/pricing";
import { PROPOSAL_SELECT } from "@/lib/proposals/types";
import { mapProposalRow } from "@/lib/proposals/server";
import { shouldExcludeFromBusinessOntology } from "./knowledgeFilter";
import { listCommitmentsForClient } from "./commitments";
import type { Entity360, Entity360Evidence, GideonClaim } from "./types";

function readDomain(
  properties: Record<string, unknown> | null | undefined,
  aliases: string[]
): string | null {
  if (properties) {
    for (const key of ["domain", "website", "url", "primary_domain"]) {
      const raw = properties[key];
      if (typeof raw === "string" && raw.trim()) {
        return raw
          .trim()
          .replace(/^https?:\/\//i, "")
          .replace(/\/.*$/, "")
          .toLowerCase();
      }
    }
  }
  for (const alias of aliases) {
    const m = alias.match(/\b([a-z0-9][a-z0-9-]{1,40}\.(?:com|io|net|org|co))\b/i);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return null;
}

/**
 * Resolve a business entity across org Spaces (canonical → alias → domain → fuzzy).
 * Does not auto-merge ambiguous organizations — returns best single match.
 */
export async function resolveBusinessEntity(
  supabase: SupabaseClient,
  args: {
    spaceIds: string[];
    mention: string;
  }
): Promise<{
  entity: OntologyEntity;
  matchType: "canonical" | "alias" | "domain" | "fuzzy";
  confidence: number;
} | null> {
  const mention = args.mention.trim();
  if (!mention || !args.spaceIds.length) return null;
  const normalized = normalizeEntityName(mention);
  const domainHint = mention
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  const looksLikeDomain = /\.[a-z]{2,}$/i.test(domainHint);

  const { data: byCanonical } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .in("profile_id", args.spaceIds)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .in("entity_type", ["client", "organization", "contact", "person"])
    .eq("canonical_name", normalized)
    .limit(5);

  if (byCanonical?.length === 1) {
    return {
      entity: byCanonical[0] as OntologyEntity,
      matchType: "canonical",
      confidence: 0.95,
    };
  }

  const { data: aliasRows } = await supabase
    .from("ontology_entity_aliases")
    .select("entity_id")
    .in("profile_id", args.spaceIds)
    .eq("normalized_alias", normalized)
    .limit(5);

  if (aliasRows?.length === 1) {
    const { data: entity } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .eq("id", aliasRows[0]!.entity_id)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
      .maybeSingle();
    if (entity) {
      return {
        entity: entity as OntologyEntity,
        matchType: "alias",
        confidence: 0.9,
      };
    }
  }

  if (looksLikeDomain || normalized.includes(" ")) {
    const { data: candidates } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("profile_id", args.spaceIds)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
      .in("entity_type", ["client", "organization"])
      .limit(80);

    const domainNeedle = looksLikeDomain
      ? domainHint
      : `${normalized.replace(/\s+/g, "")}.`;

    for (const row of (candidates as OntologyEntity[] | null) ?? []) {
      const props = row.properties ?? {};
      const domain = readDomain(props, []);
      if (domain && (domain === domainHint || domain.startsWith(domainNeedle))) {
        return { entity: row, matchType: "domain", confidence: 0.85 };
      }
      const nameNorm = normalizeEntityName(row.name);
      if (
        nameNorm === normalized ||
        nameNorm.includes(normalized) ||
        normalized.includes(nameNorm)
      ) {
        // Ambiguous multi-match: only accept high-confidence unique-ish names
        const same = ((candidates as OntologyEntity[]) ?? []).filter((c) => {
          const n = normalizeEntityName(c.name);
          return n === nameNorm || n.includes(normalized) || normalized.includes(n);
        });
        if (same.length === 1) {
          return { entity: row, matchType: "fuzzy", confidence: 0.72 };
        }
      }
    }
  }

  // Soft ilike fallback — single hit only (reviewable merges stay out of auto path)
  const { data: soft } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .in("profile_id", args.spaceIds)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .in("entity_type", ["client", "organization", "person", "contact"])
    .or(`name.ilike.%${mention.replace(/[%_]/g, "")}%,canonical_name.ilike.%${normalized}%`)
    .limit(5);

  if (soft?.length === 1) {
    return {
      entity: soft[0] as OntologyEntity,
      matchType: "fuzzy",
      confidence: 0.65,
    };
  }

  return null;
}

function isPeopleType(t: string): boolean {
  return ["person", "contact", "employee", "contractor"].includes(t);
}

function isAssessmentLike(entity: OntologyEntity): boolean {
  const blob = `${entity.name} ${entity.description ?? ""}`.toLowerCase();
  return (
    entity.entity_type === "document" ||
    /\b(assessment|security|audit|diagnostic)\b/.test(blob)
  );
}

/**
 * Build a prioritized Entity 360 summary for Gideon (not a raw ontology dump).
 */
export async function buildEntity360(
  supabase: SupabaseClient,
  args: {
    spaceIds: string[];
    businessProfileId: string;
    mention: string;
    profileNames: Record<string, string>;
  }
): Promise<{ entity360: Entity360; claims: GideonClaim[] } | null> {
  const resolved = await resolveBusinessEntity(supabase, {
    spaceIds: args.spaceIds,
    mention: args.mention,
  });
  if (!resolved) return null;

  const graph = await getEntityGraph(supabase, resolved.entity.id);
  if (!graph) return null;

  const aliases = graph.aliases.map((a) => a.alias);
  const domain = readDomain(resolved.entity.properties, [
    ...aliases,
    resolved.entity.name,
  ]);

  const relationships = [
    ...graph.outgoingRelationships.map((rel) => ({
      type: rel.relationship_type,
      direction: "outgoing" as const,
      relatedName: rel.targetEntity.name,
      relatedType: rel.targetEntity.entity_type,
      relatedId: rel.targetEntity.id,
    })),
    ...graph.incomingRelationships.map((rel) => ({
      type: rel.relationship_type,
      direction: "incoming" as const,
      relatedName: rel.sourceEntity.name,
      relatedType: rel.sourceEntity.entity_type,
      relatedId: rel.sourceEntity.id,
    })),
  ].filter((rel) => {
    return !shouldExcludeFromBusinessOntology({
      name: rel.relatedName,
      entityType: rel.relatedType,
    });
  });

  const people = graph.connectedEntities
    .filter((e) => isPeopleType(e.entity_type))
    .filter(
      (e) =>
        !shouldExcludeFromBusinessOntology({
          name: e.name,
          description: e.description,
          entityType: e.entity_type,
        })
    )
    .slice(0, 8)
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.entity_type,
      summary: e.description,
    }));

  const projects = graph.connectedEntities
    .filter((e) => e.entity_type === "project")
    .slice(0, 8)
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.entity_type,
      summary: e.description,
      status:
        typeof e.properties?.status === "string"
          ? e.properties.status
          : null,
    }));

  const contracts = graph.connectedEntities
    .filter((e) => e.entity_type === "contract")
    .slice(0, 8)
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.entity_type,
      summary: e.description,
    }));

  const assessments = graph.connectedEntities
    .filter(isAssessmentLike)
    .filter(
      (e) =>
        !shouldExcludeFromBusinessOntology({
          name: e.name,
          description: e.description,
          entityType: e.entity_type,
        })
    )
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.entity_type,
      summary: e.description,
    }));

  const risks = graph.connectedEntities
    .filter((e) => {
      const blob = `${e.name} ${e.description ?? ""}`.toLowerCase();
      return /\b(risk|finding|vulnerability|unsupported|remediation)\b/.test(
        blob
      );
    })
    .filter(
      (e) =>
        !shouldExcludeFromBusinessOntology({
          name: e.name,
          description: e.description,
          entityType: e.entity_type,
        })
    )
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.entity_type,
      summary: e.description,
    }));

  const clientNameKey = normalizeEntityName(resolved.entity.name);
  const { data: proposalRows } = await supabase
    .from("proposals")
    .select(PROPOSAL_SELECT)
    .eq("business_profile_id", args.businessProfileId)
    .order("updated_at", { ascending: false })
    .limit(40);

  const proposals = (proposalRows ?? [])
    .map((row) => mapProposalRow(row))
    .filter((p) => {
      const clientLabel =
        args.profileNames[p.client_profile_id]?.toLowerCase() ?? "";
      return (
        normalizeEntityName(clientLabel).includes(clientNameKey) ||
        clientNameKey.includes(normalizeEntityName(clientLabel)) ||
        clientLabel.includes(resolved.entity.name.toLowerCase())
      );
    })
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      amountLabel: formatMoney(p.total_cents, p.currency),
      clientName: args.profileNames[p.client_profile_id] ?? null,
      updatedAt: p.updated_at,
      sentAt: p.sent_at,
    }));

  const commitmentRows = await listCommitmentsForClient(supabase, {
    organizationId: args.businessProfileId,
    clientEntityId: resolved.entity.id,
  });

  const evidence: Entity360Evidence[] = graph.evidence
    .filter((ev) => {
      const text = (ev.evidence_text ?? "").trim();
      if (!text) return false;
      return !shouldExcludeFromBusinessOntology({ name: text });
    })
    .slice(0, 8)
    .map((ev) => ({
      id: ev.id,
      text: (ev.evidence_text ?? "").trim().slice(0, 240),
      documentName: ev.documentName ?? null,
      documentId: ev.document_id,
      sourceType: ev.source_type,
    }));

  const gaps: string[] = [];
  if (!proposals.length) {
    gaps.push(
      "Guardian currently shows no matching proposals linked to this entity by client name."
    );
  }
  if (!projects.length) {
    gaps.push(
      "I could not find an active project linked to this entity in the ontology."
    );
  }
  if (!people.length) {
    gaps.push("No contact people were found in Guardian for this entity yet.");
  }

  const entity360: Entity360 = {
    entity: {
      id: resolved.entity.id,
      name: resolved.entity.name,
      type: resolved.entity.entity_type,
      aliases,
      description: resolved.entity.description,
      domain,
      confidence: resolved.confidence,
    },
    relationships: relationships.slice(0, 12),
    people,
    proposals,
    projects,
    contracts,
    assessments,
    commitments: commitmentRows.map((c) => ({
      description: c.description,
      status: c.status,
      dueDate: c.due_date,
    })),
    risks,
    recentActivity: [...assessments, ...projects]
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        summary: item.summary,
      })),
    evidence,
    gaps,
  };

  const claims: GideonClaim[] = [];
  claims.push({
    claim: `${entity360.entity.name} appears in Guardian as a ${entity360.entity.type}.`,
    kind: "KNOWN_FACT",
    confidence: resolved.confidence,
    evidence: evidence.slice(0, 2).map((ev) => ({
      sourceId: ev.documentId ?? ev.id,
      sourceType: ev.sourceType,
      label: ev.documentName ?? "Ontology evidence",
      reference: ev.text.slice(0, 80),
    })),
  });
  for (const p of proposals.slice(0, 3)) {
    claims.push({
      claim: `${entity360.entity.name} has a ${p.amountLabel ?? ""} ${p.title} proposal (${p.status}).`.replace(
        /\s+/g,
        " "
      ),
      kind: "KNOWN_FACT",
      confidence: 0.9,
      evidence: [
        {
          sourceId: p.id,
          sourceType: "proposal",
          label: p.title,
          reference: "Proposal record",
          href: `/proposals/${p.id}`,
        },
      ],
    });
  }
  for (const a of assessments.slice(0, 2)) {
    claims.push({
      claim: `Guardian contains ${a.name} related to ${entity360.entity.name}.`,
      kind: "KNOWN_FACT",
      confidence: 0.75,
      evidence: [
        {
          sourceId: a.id,
          sourceType: "ontology_entity",
          label: a.name,
          reference: a.summary?.slice(0, 80),
        },
      ],
    });
  }

  return { entity360, claims };
}
