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
  const mention = args.mention.trim().replace(/[.,;:!?]+$/g, "");
  if (!mention || !args.spaceIds.length) return null;
  const normalized = normalizeEntityName(mention);
  const safeMention = mention.replace(/[%_,]/g, "").slice(0, 64);
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
  if (byCanonical && byCanonical.length > 1) {
    const preferred = preferBusinessEntity(byCanonical as OntologyEntity[]);
    if (preferred) {
      return { entity: preferred, matchType: "canonical", confidence: 0.9 };
    }
  }

  const { data: aliasRows } = await supabase
    .from("ontology_entity_aliases")
    .select("entity_id")
    .in("profile_id", args.spaceIds)
    .or(
      `normalized_alias.eq.${normalized},normalized_alias.ilike.%${normalized}%`
    )
    .limit(8);

  if (aliasRows?.length) {
    const ids = [...new Set(aliasRows.map((a) => String(a.entity_id)))];
    const { data: aliasEntities } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("id", ids)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES);
    const preferred = preferBusinessEntity(
      (aliasEntities as OntologyEntity[] | null) ?? []
    );
    if (preferred) {
      return { entity: preferred, matchType: "alias", confidence: 0.88 };
    }
  }

  // Name / domain scan across org-like types (including single-token names like Proxdose)
  {
    const { data: candidates } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("profile_id", args.spaceIds)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
      .in("entity_type", ["client", "organization", "contact", "person"])
      .or(
        `name.ilike.%${safeMention}%,canonical_name.ilike.%${normalized}%,description.ilike.%${safeMention}%`
      )
      .limit(40);

    const ranked = rankNameMatches(
      (candidates as OntologyEntity[] | null) ?? [],
      normalized,
      domainHint,
      looksLikeDomain
    );
    if (ranked[0] && ranked[0].score >= 0.72) {
      // Ambiguous if second is very close
      if (!ranked[1] || ranked[0].score - ranked[1].score >= 0.08) {
        return {
          entity: ranked[0].entity,
          matchType: ranked[0].matchType,
          confidence: ranked[0].score,
        };
      }
    }
  }

  // Broader scan: any entity mentioning the name (assessment titles, docs, etc.)
  // Prefer promoting an org/client; otherwise use the strongest named hit.
  {
    const { data: broad } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("profile_id", args.spaceIds)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
      .or(
        `name.ilike.%${safeMention}%,canonical_name.ilike.%${normalized}%,description.ilike.%${safeMention}%`
      )
      .limit(40);

    const preferred = preferBusinessEntity(
      (broad as OntologyEntity[] | null) ?? []
    );
    if (preferred) {
      return { entity: preferred, matchType: "fuzzy", confidence: 0.7 };
    }

    const ranked = rankNameMatches(
      (broad as OntologyEntity[] | null) ?? [],
      normalized,
      domainHint,
      looksLikeDomain
    );
    if (ranked[0] && ranked[0].score >= 0.65) {
      return {
        entity: ranked[0].entity,
        matchType: "fuzzy",
        confidence: ranked[0].score,
      };
    }
  }

  return null;
}

function preferBusinessEntity(
  entities: OntologyEntity[]
): OntologyEntity | null {
  if (!entities.length) return null;
  const score = (e: OntologyEntity) => {
    let s = 0;
    if (e.entity_type === "client") s += 40;
    else if (e.entity_type === "organization") s += 35;
    else if (e.entity_type === "contact" || e.entity_type === "person") s += 10;
    else if (e.entity_type === "document") s += 5;
    if (!shouldExcludeFromBusinessOntology({
      name: e.name,
      description: e.description,
      entityType: e.entity_type,
    })) {
      s += 5;
    }
    return s;
  };
  const sorted = [...entities].sort((a, b) => score(b) - score(a));
  return sorted[0] ?? null;
}

function rankNameMatches(
  entities: OntologyEntity[],
  normalized: string,
  domainHint: string,
  looksLikeDomain: boolean
): Array<{
  entity: OntologyEntity;
  score: number;
  matchType: "domain" | "fuzzy";
}> {
  const out: Array<{
    entity: OntologyEntity;
    score: number;
    matchType: "domain" | "fuzzy";
  }> = [];

  for (const row of entities) {
    if (
      shouldExcludeFromBusinessOntology({
        name: row.name,
        description: row.description,
        entityType: row.entity_type,
      })
    ) {
      continue;
    }
    const nameNorm = normalizeEntityName(row.name);
    const domain = readDomain(row.properties, []);
    let score = 0;
    let matchType: "domain" | "fuzzy" = "fuzzy";

    if (domain && (domain === domainHint || domain.includes(normalized))) {
      score = 0.9;
      matchType = "domain";
    } else if (nameNorm === normalized) {
      score = 0.95;
    } else if (nameNorm.startsWith(normalized) || normalized.startsWith(nameNorm)) {
      score = 0.85;
    } else if (nameNorm.includes(normalized) || normalized.includes(nameNorm)) {
      score = 0.78;
    } else if (
      (row.description ?? "").toLowerCase().includes(normalized) ||
      row.name.toLowerCase().includes(normalized)
    ) {
      score = 0.68;
    }

    if (looksLikeDomain && domain === domainHint) {
      score = Math.max(score, 0.92);
      matchType = "domain";
    }

    if (row.entity_type === "client") score += 0.03;
    if (row.entity_type === "organization") score += 0.02;

    if (score >= 0.65) {
      out.push({ entity: row, score: Math.min(0.98, score), matchType });
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out;
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

/** Strict proposal↔entity match — never treat empty client names as a match. */
export function proposalMatchesEntity(
  proposal: {
    title: string;
    summary: string | null;
    client_profile_id: string;
  },
  args: {
    mentionKeys: Set<string>;
    profileNames: Record<string, string>;
    entityName: string;
  }
): boolean {
  const clientRaw = args.profileNames[proposal.client_profile_id]?.trim() ?? "";
  const clientKey = normalizeEntityName(clientRaw);
  if (clientKey.length >= 3) {
    for (const key of args.mentionKeys) {
      if (clientKey === key || clientKey.includes(key) || key.includes(clientKey)) {
        return true;
      }
    }
  }

  const titleKey = normalizeEntityName(
    `${proposal.title} ${proposal.summary ?? ""}`
  );
  for (const key of args.mentionKeys) {
    if (key.length >= 3 && titleKey.includes(key)) return true;
  }

  const entityKey = normalizeEntityName(args.entityName);
  if (entityKey.length >= 3 && titleKey.includes(entityKey)) return true;

  return false;
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
    // Drop noisy PROPOSED_TO edges to non-proposal nodes (e.g. "Authenticated Follow-up Review").
    if (
      shouldExcludeFromBusinessOntology({
        name: rel.relatedName,
        entityType: rel.relatedType,
      })
    ) {
      return false;
    }
    if (/^PROPOSED_TO$/i.test(rel.type) && !/proposal/i.test(rel.relatedType)) {
      return false;
    }
    if (
      /\b(follow-?up review|authenticated follow|remediation plan)\b/i.test(
        rel.relatedName
      ) &&
      !/^(client|organization|person|contact|proposal|project|contract)$/i.test(
        rel.relatedType
      )
    ) {
      return false;
    }
    return true;
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
      if (isAssessmentLike(e)) return false;
      if (isPeopleType(e.entity_type)) return false;
      if (["proposal", "project", "contract", "client", "organization"].includes(e.entity_type)) {
        return false;
      }
      const blob = `${e.name} ${e.description ?? ""}`.toLowerCase();
      return /\b(risk|finding|vulnerability|unsupported php|security finding)\b/.test(
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
  const mentionKeys = new Set(
    [clientNameKey, ...aliases.map((a) => normalizeEntityName(a))].filter(
      (k) => k.length >= 3
    )
  );

  const { data: proposalRows } = await supabase
    .from("proposals")
    .select(PROPOSAL_SELECT)
    .eq("business_profile_id", args.businessProfileId)
    .order("updated_at", { ascending: false })
    .limit(40);

  const proposals = (proposalRows ?? [])
    .map((row) => mapProposalRow(row))
    .filter((p) =>
      proposalMatchesEntity(p, {
        mentionKeys,
        profileNames: args.profileNames,
        entityName: resolved.entity.name,
      })
    )
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

/**
 * When no canonical client/org exists yet, summarize ontology + proposal hits
 * that mention the name — still a briefing, not a raw numbered dump.
 */
export async function buildMentionKnowledgeBrief(
  supabase: SupabaseClient,
  args: {
    spaceIds: string[];
    businessProfileId: string;
    mention: string;
    profileNames: Record<string, string>;
  }
): Promise<{ answer: string; claims: GideonClaim[] } | null> {
  const mention = args.mention.trim().replace(/[.,;:!?]+$/g, "");
  if (!mention || !args.spaceIds.length) return null;
  const normalized = normalizeEntityName(mention);
  const safe = mention.replace(/[%_,]/g, "").slice(0, 64);

  const [{ data: entities }, { data: proposalRows }] = await Promise.all([
    supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("profile_id", args.spaceIds)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
      .or(
        `name.ilike.%${safe}%,canonical_name.ilike.%${normalized}%,description.ilike.%${safe}%`
      )
      .limit(30),
    supabase
      .from("proposals")
      .select(PROPOSAL_SELECT)
      .eq("business_profile_id", args.businessProfileId)
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  const kept = ((entities as OntologyEntity[] | null) ?? []).filter(
    (e) =>
      !shouldExcludeFromBusinessOntology({
        name: e.name,
        description: e.description,
        entityType: e.entity_type,
      })
  );

  const proposals = (proposalRows ?? [])
    .map((row) => mapProposalRow(row))
    .filter((p) =>
      proposalMatchesEntity(p, {
        mentionKeys: new Set(
          [normalized].filter((k) => k.length >= 3)
        ),
        profileNames: args.profileNames,
        entityName: mention,
      })
    );

  if (!kept.length && !proposals.length) return null;

  const assessments = kept.filter(isAssessmentLike).slice(0, 5);
  const orgs = kept.filter((e) =>
    ["client", "organization"].includes(e.entity_type)
  );
  const people = kept.filter((e) => isPeopleType(e.entity_type)).slice(0, 5);
  const other = kept
    .filter(
      (e) =>
        !isAssessmentLike(e) &&
        !["client", "organization", "person", "contact"].includes(e.entity_type)
    )
    .slice(0, 6);

  const parts: string[] = [
    mention.toUpperCase(),
    "",
    "Relationship",
    orgs.length
      ? `${mention} appears in Guardian ontology as: ${orgs
          .map((o) => `${o.name} (${o.entity_type})`)
          .join(", ")}.`
      : `Guardian does not yet have a dedicated client/organization entity named ${mention}, but related knowledge was found in this Space.`,
    "",
  ];

  if (assessments.length) {
    parts.push("Assessments / Documents");
    for (const a of assessments) {
      const desc = (a.description ?? "").trim();
      // Keep short business prose — not every extracted attribute.
      const snippet = desc
        ? desc
            .split(/[\n.;]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 12)
            .filter(
              (s) =>
                !shouldExcludeFromBusinessOntology({
                  name: s,
                })
            )
            .slice(0, 2)
            .join(". ")
        : "";
      parts.push(
        snippet
          ? `• ${a.name} — ${snippet.slice(0, 220)}`
          : `• ${a.name}`
      );
    }
    parts.push("");
  }

  if (proposals.length) {
    parts.push("Commercial Activity");
    for (const p of proposals.slice(0, 5)) {
      parts.push(
        `• ${p.title} — ${formatMoney(p.total_cents, p.currency)} (status: ${p.status})`
      );
    }
    parts.push("");
  }

  if (people.length) {
    parts.push("People");
    for (const p of people) parts.push(`• ${p.name} (${p.entity_type})`);
    parts.push("");
  }

  if (other.length) {
    parts.push("Related knowledge");
    for (const o of other) {
      parts.push(`• ${o.name} (${o.entity_type})`);
    }
    parts.push("");
  }

  parts.push("Items Requiring Attention");
  parts.push("Gideon recommendation:");
  if (!orgs.length) {
    parts.push(
      `• Confirm ${mention} as a canonical client/organization in Ontology so future Entity 360 answers are stronger.`
    );
  }
  if (assessments.length) {
    parts.push(
      "• Review whether assessment findings and remediation were completed."
    );
  }
  if (proposals.length) {
    parts.push("• Confirm status of related proposals and whether a project should be opened.");
  }
  parts.push("");
  parts.push("Sources");
  for (const a of assessments.slice(0, 4)) parts.push(`• ${a.name}`);
  for (const p of proposals.slice(0, 3)) parts.push(`• ${p.title} (proposal)`);

  const claims: GideonClaim[] = [];
  for (const a of assessments.slice(0, 3)) {
    claims.push({
      claim: `Guardian contains ${a.name} related to ${mention}.`,
      kind: "KNOWN_FACT",
      confidence: 0.7,
      evidence: [
        {
          sourceId: a.id,
          sourceType: "ontology_entity",
          label: a.name,
        },
      ],
    });
  }
  for (const p of proposals.slice(0, 3)) {
    claims.push({
      claim: `${mention} is linked to proposal ${p.title}.`,
      kind: "KNOWN_FACT",
      confidence: 0.8,
      evidence: [
        {
          sourceId: p.id,
          sourceType: "proposal",
          label: p.title,
          href: `/proposals/${p.id}`,
        },
      ],
    });
  }

  return { answer: parts.join("\n"), claims };
}
