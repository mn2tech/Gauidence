import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import {
  isAnthropicConfigured,
  isChatLlmConfigured,
} from "@/lib/analysis/chatProvider";
import { assertBillingQuota } from "@/lib/billing/quota";
import { getBusinessLeadById, loadLeadActivities, recordLeadActivity } from "@/lib/leads/server";
import type { BusinessLead } from "@/lib/leads/types";
import { LEAD_SELECT } from "@/lib/leads/types";
import type { LeadOpportunityBrief } from "@/lib/leads/opportunity";
import {
  buildLeadOutreachUserPrompt,
  LEAD_OUTREACH_SYSTEM,
  parseOutreachDraft,
  type LeadOutreachDraft,
} from "@/lib/leads/outreach";
import { withLlmUsage } from "@/lib/usage/record";
import { GUARDIAN_PROFILE_SELECT } from "@/lib/profiles/types";

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find or create a client vault under the business for this lead. */
export async function ensureClientVaultForLead(
  supabase: SupabaseClient,
  args: {
    businessProfileId: string;
    userId: string;
    lead: BusinessLead;
  }
): Promise<string> {
  const label =
    args.lead.company_name?.trim() ||
    args.lead.contact_name?.trim() ||
    "New client";

  const { data: clients } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .eq("parent_profile_id", args.businessProfileId)
    .eq("profile_type", "client");

  const normalized = normalizeName(label);
  const existing = (clients ?? []).find(
    (c) => normalizeName(String(c.display_name ?? "")) === normalized
  );
  if (existing) return String(existing.id);

  const { data: business } = await supabase
    .from("guardian_profiles")
    .select("owner_user_id")
    .eq("id", args.businessProfileId)
    .maybeSingle();

  const ownerUserId = String(business?.owner_user_id ?? args.userId);
  const row = {
    owner_user_id: ownerUserId,
    profile_type: "client" as const,
    display_name: label,
    relationship: "Client",
    parent_profile_id: args.businessProfileId,
    client_status: "active" as const,
    is_default: false,
  };

  const admin = createAdminClient();
  const client = admin ?? supabase;
  const { data: created, error } = await client
    .from("guardian_profiles")
    .insert(row)
    .select(GUARDIAN_PROFILE_SELECT)
    .single();

  if (error || !created) {
    throw new Error("Couldn't create a client vault for this lead.");
  }

  if (admin) {
    await admin.from("guardian_profile_members").upsert(
      {
        profile_id: created.id,
        user_id: args.userId,
        role: "owner",
        invited_by: args.userId,
      },
      { onConflict: "profile_id,user_id" }
    );
  }

  return String(created.id);
}

export async function runLeadOutreachDraft(
  supabase: SupabaseClient,
  args: {
    leadId: string;
    userId: string;
    userEmail?: string | null;
    senderName?: string | null;
  }
): Promise<{ lead: BusinessLead; draft: LeadOutreachDraft }> {
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

  const lead = await getBusinessLeadById(supabase, args.leadId);
  if (!lead) throw new Error("Lead not found.");

  const brief =
    lead.opportunity_brief && typeof lead.opportunity_brief === "object"
      ? (lead.opportunity_brief as LeadOpportunityBrief)
      : null;

  const { data: business } = await supabase
    .from("guardian_profiles")
    .select("display_name, business_legal_name")
    .eq("id", lead.business_profile_id)
    .maybeSingle();

  const businessName =
    (business?.business_legal_name as string) ||
    (business?.display_name as string) ||
    undefined;

  const activities = await loadLeadActivities(supabase, args.leadId).catch(
    () => []
  );
  const recentHistory = activities
    .slice(0, 8)
    .map((a) => {
      const when = (a.occurred_at ?? a.created_at).slice(0, 10);
      return `- ${when}: ${a.description ?? a.activity_type}`;
    })
    .join("\n");

  const userPrompt = buildLeadOutreachUserPrompt({
    companyName: lead.company_name,
    contactName: lead.contact_name,
    source: lead.source,
    sourceDetail: lead.source_detail,
    notes: lead.notes,
    primaryNeed: brief?.primaryNeed ?? lead.opportunity_summary,
    recommendedService: brief?.recommendedService ?? lead.recommended_service,
    conversationAngle: brief?.conversationAngle ?? lead.conversation_angle,
    reasoning: brief?.reasoning ?? lead.match_explanation,
    suggestedOpening: brief?.suggestedOpening,
    senderName: args.senderName,
    businessName,
    leadType: lead.lead_type,
    matchExplanation: lead.match_explanation,
    recommendedApproach: lead.recommended_approach,
    capabilities: lead.primary_capabilities,
    recentHistory: recentHistory || null,
  });

  const client = isAnthropicConfigured() ? createLlmClient() : null;
  const raw = await withLlmUsage({ userId: args.userId, feature: "other" }, () =>
    runChatCompletion(client, {
      system: LEAD_OUTREACH_SYSTEM,
      model: CHAT_MODEL,
      maxTokens: 1024,
      messages: [{ role: "user", content: userPrompt }],
    })
  );

  const draft = parseOutreachDraft(raw);
  if (!draft) {
    throw new Error("Gideon couldn't draft the email. Try again.");
  }

  const mergedBrief = {
    ...(lead.opportunity_brief && typeof lead.opportunity_brief === "object"
      ? lead.opportunity_brief
      : {}),
    outreachDraft: draft,
  };

  const { data: updated, error } = await supabase
    .from("business_leads")
    .update({
      opportunity_brief: mergedBrief,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", args.leadId)
    .select(LEAD_SELECT)
    .single();

  if (error || !updated) {
    throw new Error("Couldn't save the outreach draft.");
  }

  try {
    await recordLeadActivity(supabase, {
      leadId: args.leadId,
      activityType: "outreach_drafted",
      description: "Email drafted",
      actorUserId: args.userId,
    });
  } catch {
    // Non-critical.
  }

  return { lead: updated as BusinessLead, draft };
}
