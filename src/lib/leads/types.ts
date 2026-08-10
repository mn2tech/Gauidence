export const LEAD_STATUSES = [
  "new",
  "researched",
  "contacted",
  "follow_up",
  "interested",
  "proposal",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  researched: "Researched",
  contacted: "Contacted",
  follow_up: "Follow-up",
  interested: "Interested",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export const LEAD_SOURCES = [
  "Business Card",
  "Event",
  "Chamber",
  "Referral",
  "Website",
  "Excel Import",
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
] as const;

export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const LEAD_ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  created: "Lead created",
  researched: "Research completed",
  note: "Note added",
  outreach_drafted: "Email drafted",
  contacted: "Contacted",
  follow_up: "Follow-up",
  status_changed: "Status changed",
  proposal_created: "Proposal created",
};

export type BusinessLead = {
  id: string;
  business_profile_id: string;
  company_name: string | null;
  contact_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  source: string | null;
  source_detail: string | null;
  notes: string | null;
  status: LeadStatus;
  lead_score: number | null;
  recommended_service: string | null;
  opportunity_summary: string | null;
  conversation_angle: string | null;
  next_action: string | null;
  last_activity_at: string | null;
  proposal_id: string | null;
  document_id: string | null;
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
  created_by: string | null;
  created_at: string;
};

export type LeadWithActivities = BusinessLead & {
  activities: LeadActivity[];
};

export const LEAD_SELECT =
  "id,business_profile_id,company_name,contact_name,job_title,email,phone,website,address,source,source_detail,notes,status,lead_score,recommended_service,opportunity_summary,conversation_angle,next_action,last_activity_at,proposal_id,document_id,created_by,created_at,updated_at";

export const LEAD_ACTIVITY_SELECT =
  "id,lead_id,activity_type,description,metadata,created_by,created_at";

export type LeadSummaryCounts = {
  total: number;
  new: number;
  contacted: number;
  interested: number;
  proposal: number;
  won: number;
};

export function computeLeadSummary(leads: BusinessLead[]): LeadSummaryCounts {
  return {
    total: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    interested: leads.filter((l) => l.status === "interested").length,
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
