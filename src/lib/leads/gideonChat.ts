import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireEditableBusinessProfile } from "@/lib/leads/auth";
import { findPotentialDuplicates } from "@/lib/leads/duplicates";
import {
  getBusinessLeadById,
  listBusinessLeads,
  recordLeadActivity,
} from "@/lib/leads/server";
import { LEAD_SELECT, LEAD_STATUS_LABELS, leadDisplayName } from "@/lib/leads/types";
import {
  formatLeadDetail,
  formatLeadFollowUps,
  formatLeadLine,
  formatLeadPipeline,
  parseLeadsGideonQuery,
  wantsLeadsQuery,
  type LeadsGideonIntent,
} from "./gideonQuery";

export { wantsLeadsQuery };

export type LeadsGideonAnswer = {
  message: string;
  requiresConfirmation?: boolean;
  intent?: LeadsGideonIntent;
  href?: string;
};

function findLeadByName(leads: Awaited<ReturnType<typeof listBusinessLeads>>, search?: string) {
  const q = search?.trim().toLowerCase();
  if (!q) return null;
  return (
    leads.find((lead) => {
      const company = lead.company_name?.toLowerCase() ?? "";
      const contact = lead.contact_name?.toLowerCase() ?? "";
      return (
        company.includes(q) ||
        contact.includes(q) ||
        (company.length > 2 && q.includes(company))
      );
    }) ?? null
  );
}

export async function answerLeadsGideonQuery(
  supabase: SupabaseClient,
  args: {
    query: string;
    profileId: string;
    userId: string;
    confirmed?: boolean;
    chatHistory?: { role: string; content: string }[];
  }
): Promise<LeadsGideonAnswer | null> {
  let parsed = parseLeadsGideonQuery(args.query);
  if (parsed.intent === "unknown" && !wantsLeadsQuery(args.query)) {
    return null;
  }

  const isConfirmed = args.confirmed || parsed.confirmed;
  if (
    isConfirmed &&
    (parsed.intent === "create" || parsed.intent === "update_status") &&
    !parsed.companyName &&
    !parsed.contactName &&
    !parsed.search
  ) {
    const priorUser = [...(args.chatHistory ?? [])]
      .reverse()
      .find((turn) => turn.role === "user");
    if (priorUser?.content) {
      const prior = parseLeadsGideonQuery(priorUser.content);
      if (prior.intent === parsed.intent) {
        parsed = { ...prior, confirmed: true, requiresConfirmation: false };
      }
    }
  }
  const href = "/leads";

  let leads;
  try {
    leads = await listBusinessLeads(supabase, args.profileId);
  } catch {
    return {
      message: "Couldn't load leads for this workspace. Open Leads to try again.",
      href,
    };
  }

  if (parsed.intent === "create") {
    if (!parsed.companyName && !parsed.contactName) {
      return {
        message:
          'Which company or contact should I add? For example: "Add a lead for Acme, Jane Doe, jane@acme.com".',
        href,
        intent: "create",
      };
    }

    if (!isConfirmed) {
      return {
        message: parsed.confirmationMessage ?? "Reply with confirmation to add this lead.",
        requiresConfirmation: true,
        intent: "create",
        href,
      };
    }

    const business = await requireEditableBusinessProfile(
      supabase,
      args.userId,
      args.profileId
    );
    if (!business) {
      return {
        message: "You need edit access on this business workspace to add a lead.",
        href,
        intent: "create",
      };
    }

    const duplicates = await findPotentialDuplicates(supabase, business.id, {
      email: parsed.email,
      companyName: parsed.companyName,
      contactName: parsed.contactName,
      phone: parsed.phone,
    });
    if (duplicates.length > 0) {
      const existing = duplicates[0]!.lead;
      return {
        message: `That looks like an existing lead: ${formatLeadLine(existing)}. Open Leads if you still want to add a duplicate.`,
        href,
        intent: "create",
      };
    }

    const { data, error } = await supabase
      .from("business_leads")
      .insert({
        business_profile_id: business.id,
        company_name: parsed.companyName ?? null,
        contact_name: parsed.contactName ?? null,
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        source: "Ask Gideon",
        status: "new",
        created_by: args.userId,
        last_activity_at: new Date().toISOString(),
      })
      .select(LEAD_SELECT)
      .single();

    if (error || !data) {
      return {
        message: "Couldn't save that lead. Open Leads to add it there.",
        href,
        intent: "create",
      };
    }

    try {
      await recordLeadActivity(supabase, {
        leadId: data.id,
        activityType: "created",
        description: "Lead created from Ask Gideon",
        actorUserId: args.userId,
      });
    } catch {
      // Non-critical.
    }

    return {
      message: `Saved ${leadDisplayName(data)} as a new lead.`,
      intent: "create",
      href,
    };
  }

  if (parsed.intent === "update_status") {
    const lead = findLeadByName(leads, parsed.search);
    if (!lead) {
      return {
        message: parsed.search
          ? `I couldn't find a lead matching "${parsed.search}".`
          : "Which lead should I update?",
        href,
        intent: "update_status",
      };
    }
    if (!parsed.status) {
      return {
        message: `What status should I set for ${leadDisplayName(lead)}?`,
        href,
        intent: "update_status",
      };
    }
    if (!isConfirmed) {
      return {
        message: `Mark ${leadDisplayName(lead)} as ${LEAD_STATUS_LABELS[parsed.status]}? Reply "yes, mark it" to confirm.`,
        requiresConfirmation: true,
        intent: "update_status",
        href,
      };
    }

    const business = await requireEditableBusinessProfile(
      supabase,
      args.userId,
      args.profileId
    );
    if (!business) {
      return {
        message: "You need edit access on this business workspace to change lead status.",
        href,
        intent: "update_status",
      };
    }

    const previous = lead.status;
    const { error } = await supabase
      .from("business_leads")
      .update({
        status: parsed.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (error) {
      return {
        message: "Couldn't update that lead. Open Leads to change the status there.",
        href,
        intent: "update_status",
      };
    }

    try {
      await recordLeadActivity(supabase, {
        leadId: lead.id,
        activityType: "status_changed",
        description: `Status changed to ${parsed.status.replace(/_/g, " ")}`,
        actorUserId: args.userId,
        metadata: { from: previous, to: parsed.status },
      });
    } catch {
      // Non-critical.
    }

    const updated = await getBusinessLeadById(supabase, lead.id);
    return {
      message: `Updated ${leadDisplayName(updated ?? lead)} to ${LEAD_STATUS_LABELS[parsed.status]}.`,
      intent: "update_status",
      href,
    };
  }

  if (parsed.intent === "lookup") {
    const lead = findLeadByName(leads, parsed.search);
    if (!lead) {
      return {
        message: parsed.search
          ? `I couldn't find a lead matching "${parsed.search}". Open Leads to browse the pipeline.`
          : formatLeadPipeline(leads),
        href,
        intent: "lookup",
      };
    }
    return {
      message: formatLeadDetail(lead),
      intent: "lookup",
      href,
    };
  }

  if (parsed.intent === "follow_up") {
    return {
      message: formatLeadFollowUps(leads),
      intent: "follow_up",
      href,
    };
  }

  return {
    message: formatLeadPipeline(leads, parsed.status),
    intent: parsed.intent === "unknown" ? "pipeline" : parsed.intent,
    href,
  };
}
