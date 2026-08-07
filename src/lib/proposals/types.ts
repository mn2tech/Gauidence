export const PROPOSAL_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "changes_requested",
  "accepted",
  "declined",
  "expired",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  changes_requested: "Changes requested",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export const PROPOSAL_EVENT_TYPES = [
  "created",
  "updated",
  "sent",
  "viewed",
  "exported",
  "changes_requested",
  "accepted",
  "declined",
  "expired",
  "project_created",
  "contract_generated",
  "deposit_invoice_generated",
] as const;

export type ProposalEventType = (typeof PROPOSAL_EVENT_TYPES)[number];

export type ProposalLineItem = {
  id: string;
  title: string;
  description?: string;
  quantity: number;
  unitLabel: string;
  unitPriceCents: number;
  optional?: boolean;
};

export type ProposalTimelineItem = {
  id: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  sortOrder: number;
};

export type ProposalDeliverable = {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
};

export type Proposal = {
  id: string;
  business_profile_id: string;
  client_profile_id: string;
  created_by: string;
  template_id: string | null;
  title: string;
  summary: string | null;
  introduction: string | null;
  terms: string | null;
  status: ProposalStatus;
  version: number;
  currency: string;
  tax_rate_bps: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  line_items: ProposalLineItem[];
  timeline: ProposalTimelineItem[];
  deliverables: ProposalDeliverable[];
  addons: ProposalLineItem[];
  expires_at: string | null;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  client_feedback: string | null;
  document_id: string | null;
  work_project_id: string | null;
  portal_token_hash: string | null;
  portal_token_expires_at: string | null;
  external_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ProposalWithMeta = Proposal & {
  client_name?: string | null;
  business_name?: string | null;
  view_count?: number;
};

export type ProposalTemplate = {
  id: string;
  business_profile_id: string;
  created_by: string;
  name: string;
  description: string | null;
  default_title: string | null;
  default_summary: string | null;
  default_introduction: string | null;
  default_terms: string | null;
  default_line_items: ProposalLineItem[];
  default_timeline: ProposalTimelineItem[];
  default_deliverables: ProposalDeliverable[];
  default_addons: ProposalLineItem[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceTemplate = {
  id: string;
  business_profile_id: string;
  created_by: string;
  name: string;
  description: string | null;
  unit_label: string;
  unit_price_cents: number;
  default_quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProposalEvent = {
  id: string;
  proposal_id: string;
  event_type: ProposalEventType;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ProposalAnalytics = {
  total: number;
  byStatus: Record<ProposalStatus, number>;
  totalValueCents: number;
  acceptedValueCents: number;
  viewRate: number;
  acceptRate: number;
};

export const PROPOSAL_SELECT =
  "id, business_profile_id, client_profile_id, created_by, template_id, title, summary, introduction, terms, status, version, currency, tax_rate_bps, subtotal_cents, tax_cents, total_cents, line_items, timeline, deliverables, addons, expires_at, sent_at, first_viewed_at, last_viewed_at, accepted_at, declined_at, client_feedback, document_id, work_project_id, portal_token_expires_at, external_metadata, created_at, updated_at";

export const PROPOSAL_TEMPLATE_SELECT =
  "id, business_profile_id, created_by, name, description, default_title, default_summary, default_introduction, default_terms, default_line_items, default_timeline, default_deliverables, default_addons, is_active, created_at, updated_at";

export const SERVICE_TEMPLATE_SELECT =
  "id, business_profile_id, created_by, name, description, unit_label, unit_price_cents, default_quantity, is_active, created_at, updated_at";

export function isProposalStatus(value: string): value is ProposalStatus {
  return (PROPOSAL_STATUSES as readonly string[]).includes(value);
}

export function isTerminalProposalStatus(status: ProposalStatus): boolean {
  return status === "accepted" || status === "declined" || status === "expired";
}

export function canEditProposal(status: ProposalStatus): boolean {
  return status === "draft" || status === "changes_requested";
}

export function canSendProposal(status: ProposalStatus): boolean {
  return status === "draft" || status === "changes_requested";
}
