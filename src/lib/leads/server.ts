import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEAD_ACTIVITY_SELECT,
  LEAD_CONTACT_SELECT,
  LEAD_OPPORTUNITY_SELECT,
  LEAD_SELECT,
  type BusinessLead,
  type LeadActivity,
  type LeadActivityType,
  type LeadContact,
  type LeadOpportunityLink,
  type LeadType,
  type LeadWithActivities,
} from "@/lib/leads/types";

export async function listBusinessLeads(
  supabase: SupabaseClient,
  businessProfileId: string,
  options?: {
    status?: string | null;
    search?: string | null;
    leadType?: LeadType | null;
    needsFollowUp?: boolean;
    limit?: number;
  }
): Promise<BusinessLead[]> {
  let query = supabase
    .from("business_leads")
    .select(LEAD_SELECT)
    .eq("business_profile_id", businessProfileId)
    .order("updated_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.leadType) {
    query = query.eq("lead_type", options.leadType);
  }
  if (options?.needsFollowUp) {
    const today = new Date().toISOString().slice(0, 10);
    query = query.or(
      `next_action_date.lte.${today},next_action.is.null,next_action.eq.`
    );
    query = query.not("status", "in", "(won,lost,dormant)");
  }
  if (options?.search) {
    const q = options.search.replace(/%/g, "");
    query = query.or(
      `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%,notes.ilike.%${q}%,market_agency.ilike.%${q}%,naics_codes.ilike.%${q}%,federal_agencies_served.ilike.%${q}%`
    );
  }

  const { data, error } = await query.limit(options?.limit ?? 200);
  if (error) throw error;
  return (data ?? []) as BusinessLead[];
}

export async function getBusinessLeadById(
  supabase: SupabaseClient,
  leadId: string
): Promise<BusinessLead | null> {
  const { data, error } = await supabase
    .from("business_leads")
    .select(LEAD_SELECT)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw error;
  return (data as BusinessLead | null) ?? null;
}

export async function loadLeadActivities(
  supabase: SupabaseClient,
  leadId: string
): Promise<LeadActivity[]> {
  const { data, error } = await supabase
    .from("lead_activities")
    .select(LEAD_ACTIVITY_SELECT)
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadActivity[];
}

export async function loadLeadContacts(
  supabase: SupabaseClient,
  leadId: string
): Promise<LeadContact[]> {
  const { data, error } = await supabase
    .from("lead_contacts")
    .select(LEAD_CONTACT_SELECT)
    .eq("lead_id", leadId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LeadContact[];
}

export async function loadLeadOpportunities(
  supabase: SupabaseClient,
  leadId: string
): Promise<LeadOpportunityLink[]> {
  const { data, error } = await supabase
    .from("lead_opportunities")
    .select(LEAD_OPPORTUNITY_SELECT)
    .eq("lead_id", leadId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadOpportunityLink[];
}

export async function loadLeadDetail(
  supabase: SupabaseClient,
  leadId: string
): Promise<LeadWithActivities | null> {
  const lead = await getBusinessLeadById(supabase, leadId);
  if (!lead) return null;
  const [activities, contacts, opportunities] = await Promise.all([
    loadLeadActivities(supabase, leadId).catch(() => [] as LeadActivity[]),
    loadLeadContacts(supabase, leadId).catch(() => [] as LeadContact[]),
    loadLeadOpportunities(supabase, leadId).catch(
      () => [] as LeadOpportunityLink[]
    ),
  ]);
  return { ...lead, activities, contacts, opportunities };
}

export async function recordLeadActivity(
  supabase: SupabaseClient,
  args: {
    leadId: string;
    activityType: LeadActivityType;
    description?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
    contactId?: string | null;
    occurredAt?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("lead_activities").insert({
    lead_id: args.leadId,
    activity_type: args.activityType,
    description: args.description ?? null,
    created_by: args.actorUserId ?? null,
    metadata: args.metadata ?? {},
    contact_id: args.contactId ?? null,
    occurred_at: args.occurredAt ?? new Date().toISOString(),
  });
  if (error) throw error;

  const touch: Record<string, unknown> = {
    last_activity_at: new Date().toISOString(),
  };
  if (
    args.activityType === "contacted" ||
    args.activityType === "email_sent" ||
    args.activityType === "phone_call" ||
    args.activityType === "meeting" ||
    args.activityType === "linkedin"
  ) {
    touch.last_contact_at = new Date().toISOString();
  }

  await supabase.from("business_leads").update(touch).eq("id", args.leadId);
}

export async function upsertPrimaryContactFromLead(
  supabase: SupabaseClient,
  lead: Pick<
    BusinessLead,
    "id" | "contact_name" | "job_title" | "email" | "phone" | "linkedin_url"
  >,
  actorUserId: string
): Promise<void> {
  const name = lead.contact_name?.trim();
  if (!name) return;
  const existing = await loadLeadContacts(supabase, lead.id);
  if (existing.some((c) => c.is_primary || c.full_name.toLowerCase() === name.toLowerCase())) {
    return;
  }
  await supabase.from("lead_contacts").insert({
    lead_id: lead.id,
    full_name: name,
    job_title: lead.job_title,
    email: lead.email,
    phone: lead.phone,
    linkedin_url: lead.linkedin_url ?? null,
    is_primary: true,
    created_by: actorUserId,
  });
}

export async function syncLeadPrimaryContactFields(
  supabase: SupabaseClient,
  leadId: string
): Promise<void> {
  const contacts = await loadLeadContacts(supabase, leadId);
  const primary = contacts.find((c) => c.is_primary) ?? contacts[0];
  if (!primary) return;
  await supabase
    .from("business_leads")
    .update({
      contact_name: primary.full_name,
      job_title: primary.job_title,
      email: primary.email,
      phone: primary.phone,
      linkedin_url: primary.linkedin_url,
    })
    .eq("id", leadId);
}
