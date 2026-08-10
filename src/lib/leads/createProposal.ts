import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureDefaultProposalTemplates,
  findHomepageSprintTemplate,
  loadProposalTemplate,
} from "@/lib/proposals/ensureDefaultTemplates";
import { calculateProposalPricing } from "@/lib/proposals/pricing";
import { applyProposalTemplate } from "@/lib/proposals/templateApply";
import { formatProposalDate } from "@/lib/proposals/templateDates";
import {
  recordProposalEvent,
} from "@/lib/proposals/server";
import { PROPOSAL_SELECT } from "@/lib/proposals/types";
import { getBusinessLeadById, recordLeadActivity } from "@/lib/leads/server";
import type { LeadOpportunityBrief } from "@/lib/leads/opportunity";
import { ensureClientVaultForLead } from "@/lib/leads/draftOutreach";
import { parseUuid } from "@/lib/leads/validators";

function buildProposalIntroduction(
  lead: Awaited<ReturnType<typeof getBusinessLeadById>>,
  brief: LeadOpportunityBrief | null
): string {
  if (!lead) return "";
  const parts: string[] = [];
  if (brief?.conversationAngle || lead.conversation_angle) {
    parts.push(brief?.conversationAngle ?? lead.conversation_angle ?? "");
  }
  if (brief?.reasoning) parts.push(brief.reasoning);
  if (lead.notes) parts.push(`Context: ${lead.notes}`);
  if (parts.length === 0) {
    return `We'd love to help ${lead.company_name ?? "your team"} with ${lead.recommended_service ?? "the services outlined below"}.`;
  }
  return parts.join("\n\n");
}

export async function createProposalFromLead(
  supabase: SupabaseClient,
  args: {
    leadId: string;
    userId: string;
    clientProfileId?: string | null;
    templateId?: string | null;
  }
): Promise<{ proposalId: string; leadId: string; alreadyExists: boolean }> {
  const lead = await getBusinessLeadById(supabase, args.leadId);
  if (!lead) throw new Error("Lead not found.");

  if (lead.proposal_id) {
    return {
      proposalId: lead.proposal_id,
      leadId: lead.id,
      alreadyExists: true,
    };
  }

  const clientProfileId =
    parseUuid(args.clientProfileId) ??
    (await ensureClientVaultForLead(supabase, {
      businessProfileId: lead.business_profile_id,
      userId: args.userId,
      lead,
    }));

  await ensureDefaultProposalTemplates(supabase, {
    businessProfileId: lead.business_profile_id,
    userId: args.userId,
  });

  const template =
    (args.templateId
      ? await loadProposalTemplate(supabase, args.templateId)
      : null) ??
    (await findHomepageSprintTemplate(supabase, lead.business_profile_id));

  if (!template) {
    throw new Error("No proposal template found. Add a template in Proposals.");
  }

  const brief =
    lead.opportunity_brief && typeof lead.opportunity_brief === "object"
      ? (lead.opportunity_brief as LeadOpportunityBrief)
      : null;

  const companyLabel = lead.company_name ?? lead.contact_name ?? "Client";
  const serviceLabel =
    brief?.recommendedService ?? lead.recommended_service ?? "Services";

  const applied = applyProposalTemplate(template, {
    company_name: lead.company_name ?? undefined,
    website_url: lead.website ?? undefined,
    client_name: lead.contact_name ?? undefined,
    proposal_date: formatProposalDate(),
  });

  const title = `${companyLabel} — ${serviceLabel}`;
  const summary =
    brief?.primaryNeed ??
    lead.opportunity_summary ??
    applied.summary ??
    null;
  const introduction = buildProposalIntroduction(lead, brief) ||
    applied.introduction ||
    null;

  const pricing = calculateProposalPricing({
    lineItems: applied.lineItems,
    addons: applied.addons,
    taxRateBps: 0,
  });

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      business_profile_id: lead.business_profile_id,
      client_profile_id: clientProfileId,
      created_by: args.userId,
      template_id: applied.templateId,
      title,
      summary,
      introduction,
      terms: applied.terms || null,
      line_items: applied.lineItems,
      timeline: applied.timeline,
      deliverables: applied.deliverables,
      addons: applied.addons,
      subtotal_cents: pricing.subtotalCents,
      tax_cents: pricing.taxCents,
      total_cents: pricing.totalCents,
      external_metadata: {
        lead_id: lead.id,
        lead_company: lead.company_name,
        lead_contact: lead.contact_name,
        lead_email: lead.email,
      },
    })
    .select(PROPOSAL_SELECT)
    .single();

  if (error || !proposal) {
    throw new Error("Couldn't create proposal from this lead.");
  }

  const proposalId = String(proposal.id);

  await recordProposalEvent(supabase, {
    proposalId,
    eventType: "created",
    actorUserId: args.userId,
    metadata: { source: "lead", lead_id: lead.id },
  });

  const { error: leadUpdateError } = await supabase
    .from("business_leads")
    .update({
      proposal_id: proposalId,
      status: "proposal",
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  if (leadUpdateError) {
    throw new Error("Proposal created but couldn't link it to the lead.");
  }

  try {
    await recordLeadActivity(supabase, {
      leadId: lead.id,
      activityType: "proposal_created",
      description: "Proposal created",
      actorUserId: args.userId,
      metadata: { proposalId },
    });
    if (lead.status !== "proposal") {
      await recordLeadActivity(supabase, {
        leadId: lead.id,
        activityType: "status_changed",
        description: "Status changed to proposal",
        actorUserId: args.userId,
        metadata: { from: lead.status, to: "proposal" },
      });
    }
  } catch {
    // Non-critical.
  }

  return { proposalId, leadId: lead.id, alreadyExists: false };
}
