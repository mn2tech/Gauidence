import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import { isAnthropicConfigured } from "@/lib/analysis/chatProvider";
import { withLlmUsage } from "@/lib/usage/record";
import { calculateProposalPricing } from "@/lib/proposals/pricing";
import type { ProposalLineItem, ProposalTimelineItem, ProposalDeliverable } from "@/lib/proposals/types";
import { PROPOSAL_SELECT } from "@/lib/proposals/types";
import {
  DEFAULT_ADVISOR_CATALOG,
  calculateCatalogPrice,
  INDUSTRY_PLAYBOOKS,
} from "./catalog";
import { discoverWebsite } from "./discovery";
import { allAnalyzerFindings } from "./analyzers";
import {
  SYNTHESIS_SYSTEM,
  buildSynthesisPrompt,
  parseSynthesis,
} from "./synthesize";
import {
  ASSESSMENT_SELECT,
  CATALOG_SELECT,
  type AdvisorServiceCatalogItem,
  type BusinessAssessmentDetail,
} from "./types";

export async function ensureAdvisorCatalog(
  supabase: SupabaseClient,
  businessProfileId: string
): Promise<AdvisorServiceCatalogItem[]> {
  const { data: existing } = await supabase
    .from("advisor_service_catalog")
    .select(CATALOG_SELECT)
    .eq("business_profile_id", businessProfileId);
  if ((existing ?? []).length > 0) {
    return (existing ?? []) as AdvisorServiceCatalogItem[];
  }
  const rows = DEFAULT_ADVISOR_CATALOG.map((item) => ({
    business_profile_id: businessProfileId,
    ...item,
    is_active: true,
  }));
  const { data: inserted } = await supabase
    .from("advisor_service_catalog")
    .insert(rows)
    .select(CATALOG_SELECT);
  return (inserted ?? []) as AdvisorServiceCatalogItem[];
}

export async function loadAssessmentDetail(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<BusinessAssessmentDetail | null> {
  const { data: assessment } = await supabase
    .from("business_assessments")
    .select(ASSESSMENT_SELECT)
    .eq("id", assessmentId)
    .maybeSingle();
  if (!assessment) return null;

  const [findings, opportunities, solutions, outcomes] = await Promise.all([
    supabase
      .from("assessment_findings")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("created_at"),
    supabase
      .from("business_opportunities")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("priority", { ascending: false }),
    supabase
      .from("assessment_recommended_solutions")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("sort_order"),
    supabase
      .from("business_outcomes")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("sort_order"),
  ]);

  let client_name: string | null = null;
  if (assessment.client_profile_id) {
    const { data: client } = await supabase
      .from("guardian_profiles")
      .select("display_name")
      .eq("id", assessment.client_profile_id)
      .maybeSingle();
    client_name = (client?.display_name as string) ?? null;
  }

  return {
    ...(assessment as BusinessAssessmentDetail),
    findings: (findings.data ?? []) as BusinessAssessmentDetail["findings"],
    opportunities: (opportunities.data ??
      []) as BusinessAssessmentDetail["opportunities"],
    solutions: (solutions.data ?? []) as BusinessAssessmentDetail["solutions"],
    outcomes: (outcomes.data ?? []) as BusinessAssessmentDetail["outcomes"],
    client_name,
  };
}

/** Run discovery, analyzers, AI synthesis, and persist assessment results. */
export async function runAssessmentAnalysis(
  supabase: SupabaseClient,
  args: {
    assessmentId: string;
    businessProfileId: string;
    userId: string;
  }
): Promise<BusinessAssessmentDetail> {
  const detail = await loadAssessmentDetail(supabase, args.assessmentId);
  if (!detail) throw new Error("Assessment not found.");

  await supabase
    .from("business_assessments")
    .update({ status: "analyzing", error_message: null })
    .eq("id", args.assessmentId);

  try {
    const discovery = await discoverWebsite(detail.website_url);
    const findings = allAnalyzerFindings(discovery);
    const catalog = await ensureAdvisorCatalog(supabase, args.businessProfileId);

    const client = isAnthropicConfigured() ? createLlmClient() : null;
    const raw = await withLlmUsage(
      { userId: args.userId, feature: "other" },
      () =>
        runChatCompletion(client, {
          system: SYNTHESIS_SYSTEM,
          model: CHAT_MODEL,
          maxTokens: 2200,
          messages: [
            {
              role: "user",
              content: buildSynthesisPrompt({
                companyName: detail.company_name,
                websiteUrl: detail.website_url,
                findings,
                catalog,
                textSample: discovery.textSample,
              }),
            },
          ],
        })
    );
    const synthesis = parseSynthesis(raw);

    await supabase
      .from("assessment_findings")
      .delete()
      .eq("assessment_id", args.assessmentId);
    await supabase
      .from("business_opportunities")
      .delete()
      .eq("assessment_id", args.assessmentId);
    await supabase
      .from("assessment_recommended_solutions")
      .delete()
      .eq("assessment_id", args.assessmentId);
    await supabase
      .from("business_outcomes")
      .delete()
      .eq("assessment_id", args.assessmentId);

    const findingRows = findings.map((f) => ({
      assessment_id: args.assessmentId,
      ...f,
      raw_data: f.raw_data ?? {},
    }));
    if (findingRows.length > 0) {
      await supabase.from("assessment_findings").insert(findingRows);
    }

    const { data: insertedFindings } = await supabase
      .from("assessment_findings")
      .select("id, title")
      .eq("assessment_id", args.assessmentId);

    const findingIdByTitle = new Map(
      (insertedFindings ?? []).map((f) => [String(f.title), String(f.id)])
    );

    const playbook =
      INDUSTRY_PLAYBOOKS[synthesis.industry] ?? INDUSTRY_PLAYBOOKS.general;
    const solutionKeys = [
      ...new Set([
        ...synthesis.recommendedSolutionKeys,
        ...playbook.solutionKeys,
      ]),
    ].filter((key) => catalog.some((c) => c.service_key === key));

    const opportunityRows = synthesis.opportunities.map((o) => ({
      assessment_id: args.assessmentId,
      finding_id: o.findingTitle
        ? (findingIdByTitle.get(o.findingTitle) ?? null)
        : null,
      title: o.title,
      description: o.description,
      category: o.category,
      estimated_impact: o.estimatedImpact,
      confidence: o.confidence,
      priority: o.priority,
      potential_outcome: o.potentialOutcome,
      guardian_solution_key: o.guardianSolutionKey,
    }));
    if (opportunityRows.length > 0) {
      await supabase.from("business_opportunities").insert(opportunityRows);
    }

    const solutionRows = solutionKeys.map((key, index) => {
      const item = catalog.find((c) => c.service_key === key)!;
      const price = calculateCatalogPrice(item);
      return {
        assessment_id: args.assessmentId,
        service_key: key,
        title: item.name,
        description: item.description,
        reason: `Recommended for ${playbook.label} based on website and security review.`,
        business_value: item.description,
        estimated_roi: "High — addresses gaps found in the assessment",
        implementation_time: `${item.estimated_hours} hours (~${Math.ceil(item.estimated_hours / 8)} business days)`,
        price_cents: price,
        hours: item.estimated_hours,
        sort_order: index,
      };
    });
    if (solutionRows.length > 0) {
      await supabase.from("assessment_recommended_solutions").insert(solutionRows);
    }

    const outcomeRows = synthesis.outcomes.map((o, i) => ({
      assessment_id: args.assessmentId,
      outcome_text: o.outcomeText,
      measurable_metric: o.measurableMetric ?? null,
      sort_order: i,
    }));
    if (outcomeRows.length > 0) {
      await supabase.from("business_outcomes").insert(outcomeRows);
    }

    await supabase
      .from("business_assessments")
      .update({
        status: "complete",
        industry: synthesis.industry,
        executive_summary: synthesis.executiveSummary,
        analyzed_at: new Date().toISOString(),
        report_json: {
          discovery: {
            finalUrl: discovery.finalUrl,
            statusCode: discovery.statusCode,
            title: discovery.title,
            loadTimeMs: discovery.loadTimeMs,
            isHttps: discovery.isHttps,
          },
          findingCount: findings.length,
          industryLabel: playbook.label,
        },
      })
      .eq("id", args.assessmentId);

    const result = await loadAssessmentDetail(supabase, args.assessmentId);
    if (!result) throw new Error("Assessment not found after analysis.");
    return result;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Analysis failed.";
    await supabase
      .from("business_assessments")
      .update({ status: "failed", error_message: message })
      .eq("id", args.assessmentId);
    throw err;
  }
}

/** Create a draft proposal from a completed assessment. */
export async function createProposalFromAssessment(
  supabase: SupabaseClient,
  args: {
    assessmentId: string;
    userId: string;
    clientProfileId: string;
  }
): Promise<{ proposalId: string }> {
  const detail = await loadAssessmentDetail(supabase, args.assessmentId);
  if (!detail || detail.status !== "complete") {
    throw new Error("Complete an assessment before creating a proposal.");
  }

  const lineItems: ProposalLineItem[] = detail.solutions.map((s) => ({
    id: randomUUID(),
    title: s.title,
    description: s.description ?? undefined,
    quantity: 1,
    unitLabel: "project",
    unitPriceCents: s.price_cents,
  }));

  const pricing = calculateProposalPricing({
    lineItems,
    addons: [],
    taxRateBps: 0,
  });

  const findingsSummary = detail.findings
    .slice(0, 6)
    .map((f) => `• ${f.title}: ${f.description}`)
    .join("\n");

  const outcomesSummary = detail.outcomes
    .map((o) => `• ${o.outcome_text}`)
    .join("\n");

  const introduction = [
    detail.executive_summary,
    "",
    "## Key findings",
    findingsSummary,
    "",
    "## Business outcomes we will deliver",
    outcomesSummary,
  ]
    .filter(Boolean)
    .join("\n");

  const deliverables: ProposalDeliverable[] = detail.solutions.map((s, i) => ({
    id: randomUUID(),
    title: s.title,
    description: s.implementation_time ?? undefined,
    sortOrder: i,
  }));

  const timeline: ProposalTimelineItem[] = [
    {
      id: randomUUID(),
      title: "Discovery & kickoff",
      description: "Align on scope, access, and success metrics.",
      sortOrder: 0,
    },
    {
      id: randomUUID(),
      title: "Implementation",
      description: "Deliver recommended Guardian solutions.",
      sortOrder: 1,
    },
    {
      id: randomUUID(),
      title: "Launch & handoff",
      description: "Training, documentation, and go-live support.",
      sortOrder: 2,
    },
  ];

  const title = `${detail.company_name} — Digital Growth & Security Proposal`;

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      business_profile_id: detail.business_profile_id,
      client_profile_id: args.clientProfileId,
      created_by: args.userId,
      assessment_id: args.assessmentId,
      title,
      summary: detail.executive_summary?.slice(0, 500) ?? null,
      introduction,
      terms:
        "This proposal is based on an automated website and security assessment. Final scope will be confirmed during kickoff. Pricing valid for 30 days.",
      line_items: lineItems,
      timeline,
      deliverables,
      addons: [],
      subtotal_cents: pricing.subtotalCents,
      tax_cents: pricing.taxCents,
      total_cents: pricing.totalCents,
    })
    .select(PROPOSAL_SELECT)
    .single();

  if (error || !proposal) {
    throw new Error("Couldn't create proposal from assessment.");
  }

  const proposalId = String(proposal.id);
  await supabase
    .from("business_assessments")
    .update({ proposal_id: proposalId })
    .eq("id", args.assessmentId);

  return { proposalId };
}
