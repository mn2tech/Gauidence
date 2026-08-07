import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import {
  isAnthropicConfigured,
  isChatLlmConfigured,
} from "@/lib/analysis/chatProvider";
import { withLlmUsage } from "@/lib/usage/record";
import { calculateProposalPricing } from "@/lib/proposals/pricing";
import { PROPOSAL_SELECT } from "@/lib/proposals/types";
import {
  DEFAULT_ADVISOR_CATALOG,
  calculateCatalogPrice,
  INDUSTRY_PLAYBOOKS,
} from "./catalog";
import { applyProposalTemplate } from "@/lib/proposals/templateApply";
import {
  assessmentCreditDeadline,
  formatProposalDate,
} from "@/lib/proposals/templateDates";
import {
  ensureDefaultProposalTemplates,
  findDefaultAssessmentTemplate,
  loadProposalTemplate,
} from "@/lib/proposals/ensureDefaultTemplates";
import { discoverWebsite } from "./discovery";
import { allAnalyzerFindings } from "./analyzers";
import {
  SYNTHESIS_SYSTEM,
  buildSynthesisPrompt,
  resolveSynthesis,
} from "./synthesize";
import {
  ASSESSMENT_SELECT,
  CATALOG_SELECT,
  type AdvisorServiceCatalogItem,
  type BusinessAssessmentDetail,
} from "./types";

export async function clearAssessmentProposalLinks(
  supabase: SupabaseClient,
  proposalId: string
): Promise<void> {
  await supabase
    .from("business_assessments")
    .update({ proposal_id: null })
    .eq("proposal_id", proposalId);
}

async function reconcileAssessmentProposalId(
  supabase: SupabaseClient,
  assessmentId: string,
  proposalId: string | null
): Promise<string | null> {
  if (!proposalId) return null;

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id")
    .eq("id", proposalId)
    .maybeSingle();

  if (proposal) return proposalId;

  await supabase
    .from("business_assessments")
    .update({ proposal_id: null })
    .eq("id", assessmentId);

  return null;
}

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

  const proposal_id = await reconcileAssessmentProposalId(
    supabase,
    assessmentId,
    assessment.proposal_id ? String(assessment.proposal_id) : null
  );

  return {
    ...(assessment as BusinessAssessmentDetail),
    proposal_id,
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

    let raw: string | null = null;
    if (isChatLlmConfigured()) {
      const client = isAnthropicConfigured() ? createLlmClient() : null;
      try {
        raw = await withLlmUsage(
          { userId: args.userId, feature: "other" },
          () =>
            runChatCompletion(client, {
              system: SYNTHESIS_SYSTEM,
              model: CHAT_MODEL,
              maxTokens: 4096,
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
      } catch (err) {
        console.warn("Business Advisor LLM synthesis failed; using fallback", err);
      }
    }
    const synthesis = resolveSynthesis(raw, {
      companyName: detail.company_name,
      websiteUrl: detail.website_url,
      findings,
      catalog,
    });

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
    const rawMessage = err instanceof Error ? err.message : "Analysis failed.";
    const message = /json/i.test(rawMessage)
      ? "Analysis could not finish. Please run the scan again."
      : rawMessage;
    await supabase
      .from("business_assessments")
      .update({ status: "failed", error_message: message })
      .eq("id", args.assessmentId);
    throw new Error(message);
  }
}

/** Create a draft proposal from a completed assessment. */
export async function createProposalFromAssessment(
  supabase: SupabaseClient,
  args: {
    assessmentId: string;
    userId: string;
    clientProfileId: string;
    templateId?: string | null;
  }
): Promise<{ proposalId: string }> {
  const detail = await loadAssessmentDetail(supabase, args.assessmentId);
  if (!detail || detail.status !== "complete") {
    throw new Error("Complete an assessment before creating a proposal.");
  }

  await ensureDefaultProposalTemplates(supabase, {
    businessProfileId: detail.business_profile_id,
    userId: args.userId,
  });

  const template =
    (args.templateId
      ? await loadProposalTemplate(supabase, args.templateId)
      : null) ??
    (await findDefaultAssessmentTemplate(supabase, detail.business_profile_id));

  if (!template) {
    throw new Error("No proposal template found. Add a template in Proposals.");
  }

  const applied = applyProposalTemplate(template, {
    company_name: detail.company_name,
    website_url: detail.website_url,
    client_name: detail.client_name ?? undefined,
    assessment_credit_deadline: assessmentCreditDeadline(detail.analyzed_at),
    proposal_date: formatProposalDate(),
  });

  const pricing = calculateProposalPricing({
    lineItems: applied.lineItems,
    addons: applied.addons,
    taxRateBps: 0,
  });

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      business_profile_id: detail.business_profile_id,
      client_profile_id: args.clientProfileId,
      created_by: args.userId,
      assessment_id: args.assessmentId,
      template_id: applied.templateId,
      title: applied.title,
      summary: applied.summary || null,
      introduction: applied.introduction || null,
      terms: applied.terms || null,
      line_items: applied.lineItems,
      timeline: applied.timeline,
      deliverables: applied.deliverables,
      addons: applied.addons,
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
