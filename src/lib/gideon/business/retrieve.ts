import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROPOSAL_SELECT, type Proposal } from "@/lib/proposals/types";
import { mapProposalRow } from "@/lib/proposals/server";
import { planBusinessQuery } from "./queryPlanner";
import { buildEntity360, buildMentionKnowledgeBrief } from "./entity360";
import {
  describeEntityRelationships,
  findClientsWithProposalsWithoutActiveProject,
} from "./relationshipReasoning";
import { rankProposalFollowUps } from "./proposalFollowUp";
import { groupCommitmentsByClient } from "./commitments";
import { buildAdvisoryInsights } from "./advisory";
import {
  formatAdvisoryForGideon,
  formatBusinessIntelligenceBlock,
  formatClaimsForGideon,
  formatEntity360ForGideon,
  formatEntity360UserAnswer,
  formatProposalFollowUpsForGideon,
} from "./formatForGideon";
import {
  formatEvidenceAnswerFromClaims,
  mergeClaims,
  parseClaimsJson,
} from "./claims";
import {
  buildBiObservability,
  logBusinessIntelligenceTrace,
} from "./observability";
import { shouldExcludeFromBusinessOntology } from "./knowledgeFilter";
import type {
  BusinessIntelligenceBundle,
  BusinessQueryPlan,
  GideonClaim,
} from "./types";

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

export type LoadBusinessIntelligenceArgs = {
  supabase: SupabaseClient;
  businessProfileId: string;
  question: string;
  profileNames: Record<string, string>;
  /** Claims from the previous assistant message (for EVIDENCE_REQUEST). */
  priorClaims?: unknown;
  plan?: BusinessQueryPlan;
};

async function enrichProfileNamesForProposals(
  supabase: SupabaseClient,
  proposals: Proposal[],
  known: Record<string, string>
): Promise<Record<string, string>> {
  const names: Record<string, string> = { ...known };
  const missing = [
    ...new Set(
      proposals
        .map((p) => p.client_profile_id)
        .filter((id) => id && !names[id]?.trim())
    ),
  ];
  if (!missing.length) return names;
  const { data } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .in("id", missing);
  for (const row of data ?? []) {
    const display = String(row.display_name ?? "").trim();
    if (display) names[String(row.id)] = display;
  }
  return names;
}

/**
 * Intent-dependent Business Intelligence retrieval.
 * Does not run every subsystem for every question.
 */
export async function loadBusinessIntelligence(
  args: LoadBusinessIntelligenceArgs
): Promise<BusinessIntelligenceBundle> {
  const plan = args.plan ?? planBusinessQuery(args.question);
  const spaceIds = await resolvePackSpaceIds(
    args.supabase,
    args.businessProfileId
  );
  const priorClaims = parseClaimsJson(args.priorClaims);
  let profileNames = { ...args.profileNames };

  const sections: string[] = [];
  let entity360 = null as BusinessIntelligenceBundle["entity360"];
  const relationshipAnswers: string[] = [];
  let proposalFollowUps: BusinessIntelligenceBundle["proposalFollowUps"] = [];
  let commitmentsByClient: BusinessIntelligenceBundle["commitmentsByClient"] =
    [];
  let advisory: BusinessIntelligenceBundle["advisory"] = [];
  let claims: GideonClaim[] = [];
  let userAnswerDraft: string | null = null;
  let ontologyHitCount = 0;
  let structuredHitCount = 0;
  let evidenceSelected = 0;
  let filteredSystemMetadata = 0;

  // --- EVIDENCE_REQUEST: prior claims only ---
  if (plan.intent === "EVIDENCE_REQUEST") {
    const evidenceText = formatEvidenceAnswerFromClaims(priorClaims);
    sections.push("EVIDENCE REQUEST MODE:");
    sections.push(
      "Answer using PRIOR CLAIMS only. Do not invent new sources or run a broad search narrative."
    );
    sections.push("");
    sections.push(formatClaimsForGideon(priorClaims, "PRIOR CLAIMS"));
    sections.push("");
    sections.push("SUGGESTED USER-FACING ANSWER DRAFT:");
    sections.push(evidenceText);
    claims = priorClaims;
    userAnswerDraft = evidenceText;
    evidenceSelected = priorClaims.reduce(
      (n, c) => n + c.evidence.length,
      0
    );

    const observability = buildBiObservability({
      question: args.question,
      plan,
      evidenceSelected,
      claimsGenerated: claims.length,
    });
    logBusinessIntelligenceTrace(observability);

    return {
      plan,
      entity360: null,
      relationshipAnswers: [],
      proposalFollowUps: [],
      commitmentsByClient: [],
      advisory: [],
      priorClaims,
      claims,
      promptBlock: formatBusinessIntelligenceBlock({ plan, sections }),
      userAnswerDraft,
      observability,
    };
  }

  // Shared proposals load when structured data is required
  let proposals: Proposal[] = [];
  if (plan.requiresStructuredData) {
    const { data: proposalRows } = await args.supabase
      .from("proposals")
      .select(PROPOSAL_SELECT)
      .eq("business_profile_id", args.businessProfileId)
      .order("updated_at", { ascending: false })
      .limit(40);
    proposals = (proposalRows ?? []).map((row) => mapProposalRow(row));
    structuredHitCount += proposals.length;
    profileNames = await enrichProfileNamesForProposals(
      args.supabase,
      proposals,
      profileNames
    );
  }

  if (plan.intent === "ENTITY_360") {
    const mention = plan.entities[0];
    if (mention) {
      const built = await buildEntity360(args.supabase, {
        spaceIds,
        businessProfileId: args.businessProfileId,
        mention,
        profileNames,
      });
      if (built) {
        entity360 = built.entity360;
        ontologyHitCount =
          built.entity360.relationships.length +
          built.entity360.people.length +
          built.entity360.projects.length;
        evidenceSelected = built.entity360.evidence.length;
        claims = mergeClaims(claims, built.claims);
        sections.push("ENTITY 360 (synthesize into a business summary; do not dump raw lists):");
        sections.push(formatEntity360ForGideon(built.entity360));
        userAnswerDraft = formatEntity360UserAnswer(built.entity360);
      } else {
        const brief = await buildMentionKnowledgeBrief(args.supabase, {
          spaceIds,
          businessProfileId: args.businessProfileId,
          mention,
          profileNames,
        });
        if (brief) {
          claims = mergeClaims(claims, brief.claims);
          ontologyHitCount += brief.claims.length;
          sections.push(
            "ENTITY 360 FALLBACK (no canonical entity — briefing from matching ontology/proposals; do not dump raw attributes):"
          );
          sections.push(brief.answer);
          userAnswerDraft = brief.answer;
        } else {
          userAnswerDraft = [
            `I could not find a Guardian entity or matching proposals for "${mention}" in this Space yet.`,
            "",
            "Known from Guardian: no canonical client/organization match in the ontology for this Space.",
            "Gideon recommendation: run Analyze Knowledge on Proxdose documents, or confirm the exact name used in Guardian (for example PROXDOSE / Proxdose LLC / proxdose.com).",
          ].join("\n");
          sections.push(
            `ENTITY 360: no canonical entity and no mention hits for "${mention}".`
          );
        }
      }
    } else {
      sections.push(
        "ENTITY 360 requested but no entity mention was detected. Ask which client/organization to summarize."
      );
    }
  }

  if (plan.intent === "RELATIONSHIP_QUERY") {
    const q = args.question.toLowerCase();
    if (
      /proposals?.{0,40}(but|without|no).{0,40}(active )?project/.test(q) ||
      /clients?.{0,40}proposals?.{0,40}(no|without).{0,40}project/.test(q)
    ) {
      const result = await findClientsWithProposalsWithoutActiveProject(
        args.supabase,
        {
          spaceIds,
          businessProfileId: args.businessProfileId,
          profileNames,
        }
      );
      relationshipAnswers.push(...result.lines);
      claims = mergeClaims(claims, result.claims);
      ontologyHitCount += result.lines.length;
      sections.push("RELATIONSHIP ANALYSIS (proposals without active project):");
      sections.push(result.lines.join("\n"));
      userAnswerDraft = result.lines.join("\n");
    } else {
      const mention = plan.entities[0] ?? "client";
      const result = await describeEntityRelationships(args.supabase, {
        spaceIds,
        mention,
      });
      relationshipAnswers.push(...result.lines);
      claims = mergeClaims(claims, result.claims);
      ontologyHitCount += result.lines.length;
      sections.push("RELATIONSHIP TRAVERSAL:");
      sections.push(result.lines.join("\n"));
      userAnswerDraft = result.lines.join("\n");
    }
  }

  if (
    plan.intent === "PROPOSAL_ANALYSIS" ||
    plan.intent === "ADVISORY" ||
    plan.intent === "BUSINESS_STATUS"
  ) {
    const ranked = rankProposalFollowUps(proposals, {
      profileNames,
    });
    proposalFollowUps = ranked.candidates;
    claims = mergeClaims(claims, ranked.claims);
    sections.push(formatProposalFollowUpsForGideon(ranked.candidates));
    if (plan.intent === "PROPOSAL_ANALYSIS") {
      if (!ranked.candidates.length) {
        userAnswerDraft =
          "Based on available evidence, I could not find open proposals that clearly need follow-up right now.";
      } else {
        userAnswerDraft = [
          "These proposals appear to need follow-up:",
          "",
          ...ranked.candidates.slice(0, 8).flatMap((c) => [
            `${c.clientName} — ${c.title}`,
            `Amount: ${c.amountLabel ?? "unknown"} · Status: ${c.status}`,
            `Reason: ${c.reasons.join(" ")}`,
            `Recommended: ${c.recommendedAction}`,
            "",
          ]),
        ].join("\n");
      }
    }
  }

  if (plan.intent === "COMMITMENT_ANALYSIS" || plan.intent === "ADVISORY") {
    // Build entity name map for commitment grouping
    const { data: clients } = await args.supabase
      .from("ontology_entities")
      .select("id, name, description, entity_type")
      .in("profile_id", spaceIds)
      .in("entity_type", ["client", "organization"])
      .neq("review_status", "rejected")
      .limit(80);

    const entityNames: Record<string, string> = {};
    for (const c of clients ?? []) {
      if (
        shouldExcludeFromBusinessOntology({
          name: String(c.name),
          description: c.description ? String(c.description) : null,
          entityType: String(c.entity_type),
        })
      ) {
        filteredSystemMetadata += 1;
        continue;
      }
      entityNames[String(c.id)] = String(c.name);
    }

    const grouped = await groupCommitmentsByClient(args.supabase, {
      organizationId: args.businessProfileId,
      entityNames,
    });
    commitmentsByClient = grouped.groups;
    claims = mergeClaims(claims, grouped.claims);

    if (plan.intent === "COMMITMENT_ANALYSIS") {
      const draftLines: string[] = [
        "Commitments by client (status preserved from Guardian data):",
        "",
      ];
      sections.push("COMMITMENTS BY CLIENT (preserve status: PROPOSED vs RECOMMENDED vs AGREED/COMMITTED):");
      if (!grouped.groups.length) {
        sections.push(
          "No first-class commitments stored yet. You may note proposed deliverables from PROPOSALS if present, labeled PROPOSED — never as AGREED unless accepted."
        );
        if (proposals.length) {
          sections.push("", "PROPOSAL DELIVERABLES (status from proposal only):");
          for (const p of proposals.slice(0, 10)) {
            const client =
              profileNames[p.client_profile_id]?.trim() || "Client";
            const status =
              p.status === "accepted"
                ? "AGREED"
                : p.status === "sent" ||
                    p.status === "viewed" ||
                    p.status === "draft" ||
                    p.status === "changes_requested"
                  ? "PROPOSED"
                  : "UNKNOWN";
            const deliverables = p.deliverables?.length
              ? p.deliverables.map((d) => d.title)
              : [p.title];
            const proposalLabel = p.title.trim();
            for (const d of deliverables.slice(0, 4)) {
              const detail =
                d.trim().toLowerCase() === proposalLabel.toLowerCase()
                  ? d
                  : `${d} (from "${proposalLabel}")`;
              sections.push(`• ${client}: [${status}] ${detail}`);
              draftLines.push(`• ${client}: [${status}] ${detail}`);
              claims.push({
                claim: `${client}: ${detail} [${status}]`,
                kind: "KNOWN_FACT",
                confidence: p.status === "accepted" ? 0.85 : 0.6,
                evidence: [
                  {
                    sourceId: p.id,
                    sourceType: "proposal",
                    label: p.title,
                    href: `/proposals/${p.id}`,
                    reference: status,
                  },
                ],
              });
            }
          }
          draftLines.push(
            "",
            "Note: PROPOSED includes draft/sent/viewed proposals — not an agreed contractual commitment until accepted."
          );
        } else {
          draftLines.push(
            "I could not find stored commitments or proposal deliverables for clients in this Space yet."
          );
        }
      } else {
        for (const g of grouped.groups) {
          sections.push(`${g.clientName}:`);
          draftLines.push(`${g.clientName}:`);
          for (const c of g.commitments) {
            const line = `  • [${c.status}] ${c.description}${c.dueDate ? ` (due ${c.dueDate})` : ""}`;
            sections.push(line);
            draftLines.push(line);
          }
        }
      }
      userAnswerDraft = draftLines.join("\n");
    }
  }

  if (plan.intent === "ADVISORY") {
    const dueSoon = commitmentsByClient.flatMap((g) =>
      g.commitments
        .filter((c) => c.dueDate)
        .map((c) => ({
          clientName: g.clientName,
          description: c.description,
          dueDate: c.dueDate!,
          status: c.status,
        }))
    );

    const risks: Array<{
      title: string;
      summary: string;
      entityId?: string;
      evidenceLabel?: string;
    }> = [];
    if (entity360?.risks.length) {
      for (const r of entity360.risks) {
        risks.push({
          title: r.name,
          summary: r.summary ?? "Risk noted in Guardian.",
          entityId: r.id,
          evidenceLabel: r.name,
        });
      }
    }

    const built = buildAdvisoryInsights({
      proposalFollowUps,
      commitmentDueSoon: dueSoon,
      risks,
      gaps: [],
    });
    advisory = built.insights;
    claims = mergeClaims(claims, built.claims);
    sections.push(formatAdvisoryForGideon(built.insights));
    if (!built.insights.length) {
      userAnswerDraft =
        "I could not find ranked focus items from current proposals, commitments, or risks. Guardian may need more business knowledge analyzed first.";
    } else {
      userAnswerDraft = [
        "Here is what I recommend focusing on next:",
        "",
        ...built.insights.slice(0, 6).flatMap((insight, i) => [
          `${i + 1}. ${insight.title}`,
          `   Why: ${insight.why}`,
          `   Confidence: ${insight.confidence.toFixed(2)}`,
          `   Recommended next step: ${insight.recommendedNextStep}`,
          insight.evidence.length
            ? `   Evidence: ${insight.evidence.map((e) => e.label ?? e.sourceId).join("; ")}`
            : "",
          "",
        ]),
        "Known from Guardian: proposal/commitment/risk facts above.",
        "Gideon recommendation: the priority order and next steps.",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  if (plan.intent === "PROJECT_ANALYSIS") {
    sections.push(
      "PROJECT ANALYSIS: Prefer ontology project entities and HAS_PROJECT / WORKS_ON relationships. Do not invent active projects."
    );
  }

  sections.push("");
  sections.push(formatClaimsForGideon(claims));

  const observability = buildBiObservability({
    question: args.question,
    plan,
    ontologyHitCount,
    structuredHitCount,
    evidenceSelected: evidenceSelected || claims.reduce((n, c) => n + c.evidence.length, 0),
    claimsGenerated: claims.length,
    filteredSystemMetadata,
  });
  logBusinessIntelligenceTrace(observability);

  return {
    plan,
    entity360,
    relationshipAnswers,
    proposalFollowUps,
    commitmentsByClient,
    advisory,
    priorClaims,
    claims,
    promptBlock: formatBusinessIntelligenceBlock({ plan, sections }),
    userAnswerDraft,
    observability,
  };
}

/** Whether document hybrid search should run for this BI plan. */
export function biPlanRequiresDocumentSearch(plan: BusinessQueryPlan): boolean {
  return plan.requiresSearch;
}
