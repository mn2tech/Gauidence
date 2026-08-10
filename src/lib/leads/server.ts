import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEAD_ACTIVITY_SELECT,
  LEAD_SELECT,
  type BusinessLead,
  type LeadActivity,
  type LeadActivityType,
  type LeadWithActivities,
} from "@/lib/leads/types";

export async function listBusinessLeads(
  supabase: SupabaseClient,
  businessProfileId: string,
  options?: {
    status?: string | null;
    search?: string | null;
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
  if (options?.search) {
    const q = options.search.replace(/%/g, "");
    query = query.or(
      `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%,notes.ilike.%${q}%`
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
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadActivity[];
}

export async function loadLeadDetail(
  supabase: SupabaseClient,
  leadId: string
): Promise<LeadWithActivities | null> {
  const lead = await getBusinessLeadById(supabase, leadId);
  if (!lead) return null;
  const activities = await loadLeadActivities(supabase, leadId);
  return { ...lead, activities };
}

export async function recordLeadActivity(
  supabase: SupabaseClient,
  args: {
    leadId: string;
    activityType: LeadActivityType;
    description?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("lead_activities").insert({
    lead_id: args.leadId,
    activity_type: args.activityType,
    description: args.description ?? null,
    created_by: args.actorUserId ?? null,
    metadata: args.metadata ?? {},
  });
  if (error) throw error;

  await supabase
    .from("business_leads")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", args.leadId);
}
