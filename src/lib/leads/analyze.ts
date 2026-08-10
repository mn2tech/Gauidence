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
import { discoverWebsite } from "@/lib/business-advisor/discovery";
import { ensureAdvisorCatalog } from "@/lib/business-advisor/server";
import { assertBillingQuota } from "@/lib/billing/quota";
import { isKnowledgeEngineV2Enabled } from "@/lib/features/knowledge-engine-v2";
import { retrieveStructuredKnowledge } from "@/lib/knowledge/v2/retrieve";
import { formatKnowledgeForGideon } from "@/lib/knowledge/v2/formatForGideon";
import {
  LEAD_OPPORTUNITY_SYSTEM,
  buildLeadOpportunityUserPrompt,
} from "@/lib/leads/prompt";
import { recordLeadActivity } from "@/lib/leads/server";
import type { BusinessLead } from "@/lib/leads/types";
import { LEAD_SELECT } from "@/lib/leads/types";
import {
  type LeadOpportunityBrief,
  type LeadPotentialNeed,
  isLeadEvidenceKind,
} from "@/lib/leads/opportunity";
import { SERVICE_TEMPLATE_SELECT } from "@/lib/proposals/types";
import { withLlmUsage } from "@/lib/usage/record";

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseBrief(raw: string): LeadOpportunityBrief | null {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const needsRaw = Array.isArray(parsed.potentialNeeds)
      ? parsed.potentialNeeds
      : [];
    const potentialNeeds: LeadPotentialNeed[] = needsRaw
      .slice(0, 8)
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const kind = String(row.kind ?? "inferred").toLowerCase();
        return {
          label: String(row.label ?? "").trim(),
          kind: isLeadEvidenceKind(kind) ? kind : "inferred",
          detail: String(row.detail ?? "").trim(),
        };
      })
      .filter(
        (n): n is LeadPotentialNeed =>
          n != null && n.label.length > 0 && n.detail.length > 0
      );

    const primaryNeed = String(parsed.primaryNeed ?? "").trim();
    const recommendedService = String(parsed.recommendedService ?? "").trim();
    if (!primaryNeed && !recommendedService) return null;

    return {
      companySummary: String(parsed.companySummary ?? "").trim(),
      primaryNeed,
      potentialNeeds,
      recommendedService,
      reasoning: String(parsed.reasoning ?? "").trim(),
      conversationAngle: String(parsed.conversationAngle ?? "").trim(),
      suggestedOpening: String(parsed.suggestedOpening ?? "").trim(),
      leadScore: clampScore(parsed.leadScore),
      nextBestAction: String(parsed.nextBestAction ?? "").trim(),
      analyzedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function runLeadOpportunityAnalysis(
  supabase: SupabaseClient,
  args: {
    leadId: string;
    userId: string;
    userEmail?: string | null;
  }
): Promise<{ lead: BusinessLead; brief: LeadOpportunityBrief }> {
  if (!isChatLlmConfigured()) {
    throw new Error("AI isn't configured on this deployment.");
  }

  const quota = await assertBillingQuota(
    supabase,
    args.userId,
    "chat",
    args.userEmail
  );
  if (!quota.ok) {
    throw new Error("You've reached your AI usage limit for now.");
  }

  const { data: leadRow, error: leadError } = await supabase
    .from("business_leads")
    .select(LEAD_SELECT)
    .eq("id", args.leadId)
    .maybeSingle();

  if (leadError || !leadRow) {
    throw new Error("Lead not found.");
  }

  const lead = leadRow as BusinessLead;

  const { data: business } = await supabase
    .from("guardian_profiles")
    .select(
      "id, display_name, business_legal_name, industry, description, website"
    )
    .eq("id", lead.business_profile_id)
    .maybeSingle();

  const businessName =
    (business?.business_legal_name as string) ||
    (business?.display_name as string) ||
    "Business";

  let discovery: Awaited<ReturnType<typeof discoverWebsite>> | null = null;
  let discoveryError: string | null = null;
  const website = lead.website?.trim();
  if (website) {
    try {
      discovery = await discoverWebsite(website);
    } catch (err) {
      discoveryError =
        err instanceof Error ? err.message : "Couldn't reach the website.";
    }
  }

  const [{ data: services }, advisorCatalog] = await Promise.all([
    supabase
      .from("service_templates")
      .select(SERVICE_TEMPLATE_SELECT)
      .eq("business_profile_id", lead.business_profile_id)
      .eq("is_active", true)
      .limit(30),
    ensureAdvisorCatalog(supabase, lead.business_profile_id),
  ]);

  const serviceCatalog = (services ?? [])
    .map((row) => {
      const price = Number(row.unit_price_cents ?? 0) / 100;
      return `- ${row.name}: $${price.toFixed(2)} / ${row.unit_label}${row.description ? ` — ${row.description}` : ""}`;
    })
    .join("\n");

  const advisorBlock = advisorCatalog
    .filter((c) => c.is_active)
    .map(
      (c) =>
        `- ${c.service_key}: ${c.name} (${c.category}) — ${c.description ?? ""}`
    )
    .join("\n");

  let knowledgeContext = "";
  if (isKnowledgeEngineV2Enabled()) {
    const question = [
      lead.company_name,
      lead.notes,
      lead.website,
      "business opportunity services",
    ]
      .filter(Boolean)
      .join(" ");
    const knowledge = await retrieveStructuredKnowledge(supabase, {
      question,
      profileIds: [lead.business_profile_id],
    });
    knowledgeContext = formatKnowledgeForGideon(knowledge, {
      [lead.business_profile_id]: businessName,
    });
  }

  const userPrompt = buildLeadOpportunityUserPrompt({
    lead,
    businessName,
    businessDescription: business?.description as string | null,
    businessIndustry: business?.industry as string | null,
    discovery,
    discoveryError,
    serviceCatalog,
    advisorCatalog: advisorBlock,
    knowledgeContext,
  });

  const client = isAnthropicConfigured() ? createLlmClient() : null;
  const raw = await withLlmUsage({ userId: args.userId, feature: "other" }, () =>
    runChatCompletion(client, {
      system: LEAD_OPPORTUNITY_SYSTEM,
      model: CHAT_MODEL,
      maxTokens: 2048,
      messages: [{ role: "user", content: userPrompt }],
    })
  );

  const brief = parseBrief(raw);
  if (!brief) {
    throw new Error("Gideon couldn't produce an opportunity brief. Try again.");
  }

  const newStatus =
    lead.status === "new" ? "researched" : lead.status;

  const { data: updated, error: updateError } = await supabase
    .from("business_leads")
    .update({
      lead_score: brief.leadScore,
      recommended_service: brief.recommendedService || null,
      opportunity_summary: brief.primaryNeed || null,
      conversation_angle: brief.conversationAngle || null,
      next_action: brief.nextBestAction || null,
      opportunity_brief: brief,
      status: newStatus,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", args.leadId)
    .select(LEAD_SELECT)
    .single();

  if (updateError || !updated) {
    throw new Error("Couldn't save the opportunity brief.");
  }

  try {
    await recordLeadActivity(supabase, {
      leadId: args.leadId,
      activityType: "researched",
      description: "Research completed",
      actorUserId: args.userId,
      metadata: { leadScore: brief.leadScore },
    });
    if (newStatus !== lead.status) {
      await recordLeadActivity(supabase, {
        leadId: args.leadId,
        activityType: "status_changed",
        description: "Status changed to researched",
        actorUserId: args.userId,
        metadata: { from: lead.status, to: newStatus },
      });
    }
  } catch {
    // Non-critical.
  }

  return { lead: updated as BusinessLead, brief };
}
