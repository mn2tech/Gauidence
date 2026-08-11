import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
  runStructuredJson,
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
  LEAD_OPPORTUNITY_SCHEMA,
  parseLeadOpportunityBrief,
} from "@/lib/leads/opportunity";
import { SERVICE_TEMPLATE_SELECT } from "@/lib/proposals/types";
import { withLlmUsage } from "@/lib/usage/record";

async function requestOpportunityBrief(
  userId: string,
  userPrompt: string
): Promise<LeadOpportunityBrief | null> {
  if (isAnthropicConfigured()) {
    try {
      const client = createLlmClient();
      const structured = await withLlmUsage(
        { userId, feature: "other" },
        () =>
          runStructuredJson<Record<string, unknown>>(client, {
            system: LEAD_OPPORTUNITY_SYSTEM,
            userContent: [{ type: "text", text: userPrompt }],
            schema: LEAD_OPPORTUNITY_SCHEMA as unknown as Record<
              string,
              unknown
            >,
            schemaName: "lead_opportunity_brief",
            model: CHAT_MODEL,
          })
      );
      const brief = parseLeadOpportunityBrief(structured);
      if (brief) return brief;
    } catch (err) {
      console.warn("Structured lead opportunity analysis failed; retrying", {
        message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      });
    }
  }

  const client = isAnthropicConfigured() ? createLlmClient() : null;
  const raw = await withLlmUsage({ userId, feature: "other" }, () =>
    runChatCompletion(client, {
      system: `${LEAD_OPPORTUNITY_SYSTEM}

You MUST respond with a single JSON object only (no markdown fences, no prose).`,
      model: CHAT_MODEL,
      maxTokens: 2048,
      messages: [{ role: "user", content: userPrompt }],
    })
  );

  return parseLeadOpportunityBrief(raw);
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

  const brief = await requestOpportunityBrief(args.userId, userPrompt);
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
