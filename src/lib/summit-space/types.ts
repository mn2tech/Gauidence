export const SUMMIT_ENTITY_TYPES = [
  "organization",
  "person",
  "session",
  "opportunity",
  "agency",
  "contract_vehicle",
  "resource",
  "action_item",
  "capability",
] as const;

export type SummitEntityType = (typeof SUMMIT_ENTITY_TYPES)[number];

export const SUMMIT_RELATIONSHIP_TYPES = [
  "works_for",
  "spoke_at",
  "offers",
  "primes_for",
  "related_to",
  "participates_in",
  "mentions",
  "supports",
  "has_next_action",
] as const;

export type SummitRelationshipType = (typeof SUMMIT_RELATIONSHIP_TYPES)[number];

export const SUMMIT_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type SummitPriority = (typeof SUMMIT_PRIORITIES)[number];

export type SummitSpaceRow = {
  id: string;
  slug: string;
  profile_id: string | null;
  name: string;
  subtitle: string | null;
  description: string | null;
  owner_label: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type SummitEntityRow = {
  id: string;
  summit_slug: string;
  entity_type: SummitEntityType;
  slug: string | null;
  name: string;
  description: string | null;
  properties: Record<string, unknown>;
  lifecycle_status: string;
  visibility: string;
  source_label: string | null;
  source_url: string | null;
  source_type: string;
  last_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type SummitRelationshipRow = {
  id: string;
  summit_slug: string;
  source_entity_id: string;
  relationship_type: string;
  target_entity_id: string;
  properties: Record<string, unknown>;
  lifecycle_status: string;
  visibility: string;
  source_label: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

export type SummitPrivateCaptureRow = {
  id: string;
  summit_slug: string;
  organization_entity_id: string | null;
  organization_name: string;
  priority: SummitPriority;
  relationship_strength: string | null;
  opportunity_fit: string | null;
  capabilities_to_pitch: string | null;
  next_action: string | null;
  follow_up_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SummitIntelligenceDraftRow = {
  id: string;
  summit_slug: string;
  draft_type: string;
  title: string | null;
  extracted_data: Record<string, unknown>;
  source_document_id: string | null;
  status: "pending_review" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SummitLeadRow = {
  id: string;
  summit_slug: string;
  name: string;
  company: string | null;
  email: string;
  created_at: string;
};

export type PublishedSummitKnowledge = {
  space: SummitSpaceRow;
  entities: SummitEntityRow[];
  relationships: SummitRelationshipRow[];
};

export type OrganizationPageData = {
  organization: SummitEntityRow;
  speakers: SummitEntityRow[];
  sessions: SummitEntityRow[];
  opportunities: SummitEntityRow[];
  agencies: SummitEntityRow[];
  resources: SummitEntityRow[];
  relatedEntities: SummitEntityRow[];
};

export type OpportunityPageData = {
  opportunity: SummitEntityRow;
  organization: SummitEntityRow | null;
  sessions: SummitEntityRow[];
  agencies: SummitEntityRow[];
  resources: SummitEntityRow[];
};

export type AgencyPageData = {
  agency: SummitEntityRow;
  sessions: SummitEntityRow[];
  organizations: SummitEntityRow[];
  opportunities: SummitEntityRow[];
  resources: SummitEntityRow[];
};

export type ResourcePageData = {
  resource: SummitEntityRow;
  agencies: SummitEntityRow[];
  opportunities: SummitEntityRow[];
};

export type TakeawayPageData = {
  takeaway: SummitEntityRow;
  sessions: SummitEntityRow[];
  organizations: SummitEntityRow[];
};

export type SessionPageData = {
  session: SummitEntityRow;
  speakers: SummitEntityRow[];
  organizations: SummitEntityRow[];
  opportunities: SummitEntityRow[];
};
