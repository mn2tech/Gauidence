import type { LeadOpportunityBrief } from "@/lib/leads/opportunity";

export const LEAD_TYPES = ["commercial", "federal_partner"] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  commercial: "Commercial",
  federal_partner: "Federal Partner",
};

/** All persisted statuses (legacy + commercial + federal). */
export const LEAD_STATUSES = [
  "new",
  "researched",
  "research",
  "ready_to_contact",
  "contacted",
  "replied",
  "meeting",
  "demo",
  "follow_up",
  "interested",
  "proposal",
  "won",
  "lost",
  "identified",
  "qualified",
  "contact_ready",
  "capability_meeting",
  "teaming_discussion",
  "opportunity_identified",
  "teaming_subcontract",
  "active_partner",
  "dormant",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  researched: "Research",
  research: "Research",
  ready_to_contact: "Ready to Contact",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting",
  demo: "Demo",
  follow_up: "Follow-Up",
  interested: "Interested",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
  identified: "Identified",
  qualified: "Qualified",
  contact_ready: "Contact Ready",
  capability_meeting: "Capability Meeting",
  teaming_discussion: "Teaming Discussion",
  opportunity_identified: "Opportunity Identified",
  teaming_subcontract: "Teaming/Subcontract",
  active_partner: "Active Partner",
  dormant: "Dormant",
};

export const COMMERCIAL_STAGES: LeadStatus[] = [
  "new",
  "research",
  "ready_to_contact",
  "contacted",
  "replied",
  "meeting",
  "demo",
  "proposal",
  "won",
  "lost",
];

export const FEDERAL_STAGES: LeadStatus[] = [
  "identified",
  "research",
  "qualified",
  "contact_ready",
  "contacted",
  "follow_up",
  "capability_meeting",
  "teaming_discussion",
  "opportunity_identified",
  "teaming_subcontract",
  "active_partner",
  "dormant",
];

export const SMALL_BUSINESS_STATUSES = [
  "Small Business",
  "8(a)",
  "HUBZone",
  "WOSB",
  "EDWOSB",
  "SDVOSB",
  "VOSB",
  "Other",
  "Unknown",
] as const;

export type SmallBusinessStatus = (typeof SMALL_BUSINESS_STATUSES)[number];

export const LEAD_SOURCES = [
  "Business Card",
  "Event",
  "Networking Event",
  "Chamber",
  "Referral",
  "Website",
  "Company Website",
  "SAM.gov",
  "LinkedIn",
  "Existing Relationship",
  "Excel Import",
  "Manual",
  "Other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_ACTIVITY_TYPES = [
  "created",
  "researched",
  "note",
  "outreach_drafted",
  "contacted",
  "follow_up",
  "status_changed",
  "proposal_created",
  "email_sent",
  "email_received",
  "phone_call",
  "meeting",
  "networking_event",
  "linkedin",
  "capability_statement",
  "proposal_sent",
  "teaming_discussion",
  "opportunity_discussion",
] as const;

export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const LEAD_ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  created: "Lead created",
  researched: "Research completed",
  note: "Note",
  outreach_drafted: "Outreach drafted",
  contacted: "Contacted",
  follow_up: "Follow-up",
  status_changed: "Status changed",
  proposal_created: "Proposal created",
  email_sent: "Email sent",
  email_received: "Email received",
  phone_call: "Phone call",
  meeting: "Meeting",
  networking_event: "Networking event",
  linkedin: "LinkedIn",
  capability_statement: "Capability statement sent",
  proposal_sent: "Proposal sent",
  teaming_discussion: "Teaming discussion",
  opportunity_discussion: "Opportunity discussion",
};

export type ExtractedBusinessCard = {
  contactName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
};

export type LeadContact = {
  id: string;
  lead_id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  is_primary: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadOpportunityLink = {
  id: string;
  business_profile_id: string;
  lead_id: string | null;
  title: string;
  agency: string | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessLead = {
  id: string;
  business_profile_id: string;
  lead_type?: LeadType | null;
  company_name: string | null;
  contact_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  linkedin_url?: string | null;
  source: string | null;
  source_detail: string | null;
  notes: string | null;
  status: LeadStatus;
  lead_score: number | null;
  recommended_service: string | null;
  opportunity_summary: string | null;
  conversation_angle: string | null;
  next_action: string | null;
  next_action_date?: string | null;
  last_activity_at: string | null;
  last_contact_at?: string | null;
  relationship_owner?: string | null;
  small_business_status?: string | null;
  uei?: string | null;
  cage_code?: string | null;
  naics_codes?: string | null;
  primary_capabilities?: string | null;
  federal_agencies_served?: string | null;
  contract_vehicles?: string | null;
  known_contracts?: string | null;
  current_opportunities?: string | null;
  past_performance_areas?: string | null;
  technology_areas?: string | null;
  market_agency?: string | null;
  match_explanation?: string | null;
  recommended_approach?: string | null;
  proposal_id: string | null;
  document_id: string | null;
  opportunity_brief?: LeadOpportunityBrief | Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type LeadActivity = {
  id: string;
  lead_id: string;
  activity_type: LeadActivityType;
  description: string | null;
  metadata: Record<string, unknown>;
  contact_id?: string | null;
  occurred_at?: string | null;
  created_by: string | null;
  created_at: string;
};

export type LeadWithActivities = BusinessLead & {
  activities: LeadActivity[];
  contacts?: LeadContact[];
  opportunities?: LeadOpportunityLink[];
};

export const LEAD_SELECT =
  "id,business_profile_id,lead_type,company_name,contact_name,job_title,email,phone,website,address,linkedin_url,source,source_detail,notes,status,lead_score,recommended_service,opportunity_summary,conversation_angle,next_action,next_action_date,last_activity_at,last_contact_at,relationship_owner,small_business_status,uei,cage_code,naics_codes,primary_capabilities,federal_agencies_served,contract_vehicles,known_contracts,current_opportunities,past_performance_areas,technology_areas,market_agency,match_explanation,recommended_approach,proposal_id,document_id,opportunity_brief,created_by,created_at,updated_at";

export const LEAD_ACTIVITY_SELECT =
  "id,lead_id,activity_type,description,metadata,contact_id,occurred_at,created_by,created_at";

export const LEAD_CONTACT_SELECT =
  "id,lead_id,full_name,job_title,email,phone,linkedin_url,is_primary,notes,created_by,created_at,updated_at";

export const LEAD_OPPORTUNITY_SELECT =
  "id,business_profile_id,lead_id,title,agency,notes,status,created_by,created_at,updated_at";

export type LeadSummaryCounts = {
  total: number;
  commercial: number;
  federal: number;
  needFollowUp: number;
  meetings: number;
  proposals: number;
  activeOpportunities: number;
  activePartners: number;
  new: number;
  contacted: number;
  interested: number;
  proposal: number;
  won: number;
};

function isFederal(lead: BusinessLead): boolean {
  return lead.lead_type === "federal_partner";
}

function needsFollowUp(lead: BusinessLead, todayIso: string): boolean {
  if (lead.status === "won" || lead.status === "lost" || lead.status === "dormant") {
    return false;
  }
  if (lead.next_action_date && lead.next_action_date <= todayIso) return true;
  if (!lead.next_action?.trim()) return true;
  return false;
}

export function computeLeadSummary(leads: BusinessLead[]): LeadSummaryCounts {
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: leads.length,
    commercial: leads.filter((l) => !isFederal(l)).length,
    federal: leads.filter(isFederal).length,
    needFollowUp: leads.filter((l) => needsFollowUp(l, today)).length,
    meetings: leads.filter((l) =>
      ["meeting", "capability_meeting", "interested"].includes(l.status)
    ).length,
    proposals: leads.filter((l) => l.status === "proposal" || Boolean(l.proposal_id))
      .length,
    activeOpportunities: leads.filter(
      (l) =>
        l.status === "opportunity_identified" ||
        Boolean(l.current_opportunities?.trim())
    ).length,
    activePartners: leads.filter((l) => l.status === "active_partner").length,
    new: leads.filter((l) => l.status === "new" || l.status === "identified").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    interested: leads.filter((l) => l.status === "interested" || l.status === "meeting")
      .length,
    proposal: leads.filter((l) => l.status === "proposal").length,
    won: leads.filter((l) => l.status === "won").length,
  };
}

export function leadDisplayName(lead: BusinessLead): string {
  if (lead.company_name?.trim()) return lead.company_name.trim();
  if (lead.contact_name?.trim()) return lead.contact_name.trim();
  return "Untitled lead";
}

export function leadContactLine(lead: BusinessLead): string {
  const parts = [lead.contact_name, lead.job_title].filter(Boolean);
  return parts.join(" · ");
}

export function leadTypeOf(lead: Pick<BusinessLead, "lead_type">): LeadType {
  return lead.lead_type === "federal_partner" ? "federal_partner" : "commercial";
}

export function defaultStatusForLeadType(type: LeadType): LeadStatus {
  return type === "federal_partner" ? "identified" : "new";
}

export function stagesForLeadType(type: LeadType, current?: LeadStatus): LeadStatus[] {
  const base = type === "federal_partner" ? FEDERAL_STAGES : COMMERCIAL_STAGES;
  if (current && !base.includes(current)) return [current, ...base];
  return base;
}

export function isOverdueNextAction(lead: BusinessLead, todayIso?: string): boolean {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  if (!lead.next_action_date) return false;
  if (lead.status === "won" || lead.status === "lost" || lead.status === "dormant") {
    return false;
  }
  return lead.next_action_date <= today;
}

export function todaysActionLeads(leads: BusinessLead[]): BusinessLead[] {
  const today = new Date().toISOString().slice(0, 10);
  return leads.filter((lead) => {
    if (lead.status === "won" || lead.status === "lost" || lead.status === "dormant") {
      return false;
    }
    if (lead.next_action_date && lead.next_action_date <= today) return true;
    if (!lead.next_action?.trim() && (lead.status === "new" || lead.status === "identified")) {
      return true;
    }
    return false;
  });
}

export function todaysActionBreakdown(leads: BusinessLead[]) {
  const today = todaysActionLeads(leads);
  return {
    total: today.length,
    federal: today.filter((l) => isFederal(l)).length,
    commercial: today.filter((l) => !isFederal(l)).length,
    proposals: today.filter(
      (l) => l.status === "proposal" || Boolean(l.proposal_id)
    ).length,
    meetings: today.filter((l) =>
      ["meeting", "capability_meeting"].includes(l.status)
    ).length,
  };
}

export type LeadListFilters = {
  agency?: string;
  naics?: string;
  sbStatus?: string;
  capability?: string;
  minMatch?: number | null;
  needsFollowUp?: boolean;
  hasOpportunity?: boolean;
  lastContactDays?: number | null;
};

export function applyLeadListFilters(
  leads: BusinessLead[],
  filters: LeadListFilters
): BusinessLead[] {
  const today = new Date().toISOString().slice(0, 10);
  const agency = filters.agency?.trim().toLowerCase();
  const naics = filters.naics?.trim().toLowerCase();
  const capability = filters.capability?.trim().toLowerCase();
  const sbStatus = filters.sbStatus?.trim().toLowerCase();
  return leads.filter((lead) => {
    if (agency) {
      const hay = `${lead.market_agency ?? ""} ${lead.federal_agencies_served ?? ""}`.toLowerCase();
      if (!hay.includes(agency)) return false;
    }
    if (naics && !(lead.naics_codes ?? "").toLowerCase().includes(naics)) {
      return false;
    }
    if (
      sbStatus &&
      !(lead.small_business_status ?? "").toLowerCase().includes(sbStatus)
    ) {
      return false;
    }
    if (capability) {
      const hay = `${lead.primary_capabilities ?? ""} ${lead.technology_areas ?? ""} ${lead.match_explanation ?? ""}`.toLowerCase();
      if (!hay.includes(capability)) return false;
    }
    if (filters.minMatch != null && (lead.lead_score ?? -1) < filters.minMatch) {
      return false;
    }
    if (filters.needsFollowUp && !needsFollowUp(lead, today)) return false;
    if (filters.hasOpportunity &&
      !(
        lead.status === "opportunity_identified" ||
        Boolean(lead.current_opportunities?.trim())
      )
    ) {
      return false;
    }
    if (filters.lastContactDays != null) {
      const cutoff = Date.now() - filters.lastContactDays * 86_400_000;
      const stamp = lead.last_contact_at ?? lead.last_activity_at ?? lead.updated_at;
      const ts = Date.parse(stamp);
      if (!(Number.isFinite(ts) && ts < cutoff)) return false;
    }
    return true;
  });
}

export function staleLeads(leads: BusinessLead[], days = 30): BusinessLead[] {
  const cutoff = Date.now() - days * 86_400_000;
  return leads.filter((lead) => {
    if (["won", "lost", "dormant"].includes(lead.status)) return false;
    const stamp = lead.last_contact_at ?? lead.last_activity_at ?? lead.updated_at;
    const ts = Date.parse(stamp);
    return Number.isFinite(ts) && ts < cutoff;
  });
}

export function missingLeadFacts(lead: BusinessLead): string[] {
  const missing: string[] = [];
  if (!lead.website?.trim()) missing.push("website");
  if (!lead.email?.trim() && !lead.phone?.trim()) {
    missing.push("contact email or phone");
  }
  if (!lead.next_action?.trim()) missing.push("next action");
  if (isFederal(lead)) {
    if (!lead.uei?.trim() && !lead.cage_code?.trim()) missing.push("UEI or CAGE");
    if (!lead.federal_agencies_served?.trim() && !lead.market_agency?.trim()) {
      missing.push("agencies served");
    }
  }
  return missing;
}
