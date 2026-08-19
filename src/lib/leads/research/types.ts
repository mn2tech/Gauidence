export const RESEARCH_CONFIDENCE = [
  "verified",
  "high",
  "medium",
  "low",
  "not_found",
] as const;

export type ResearchConfidence = (typeof RESEARCH_CONFIDENCE)[number];

export const RESEARCH_SOURCE_TYPES = [
  "sam.gov",
  "usaspending.gov",
  "gsa",
  "fpds",
  "company_website",
  "capability_statement",
  "agency_announcement",
  "sba",
  "linkedin",
  "nm2tech_workspace",
  "other",
] as const;

export type ResearchSourceType = (typeof RESEARCH_SOURCE_TYPES)[number];

export type ResearchFact<T = unknown> = {
  value: T;
  confidence: ResearchConfidence;
  source: string;
  sourceType: ResearchSourceType;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
  notes?: string | null;
};

export const SMALL_BUSINESS_STATUS_OPTIONS = [
  "Small Business",
  "SDB",
  "8(a)",
  "WOSB",
  "EDWOSB",
  "HUBZone",
  "SDVOSB",
  "VOSB",
  "ANC",
  "Other",
  "Unknown",
] as const;

export type SmallBusinessStatusOption =
  (typeof SMALL_BUSINESS_STATUS_OPTIONS)[number];

export type NaicsEntry = {
  code: string;
  title: string;
  isPrimary: boolean;
};

export type AgencyEntry = {
  name: string;
  bureaus: string[];
};

export type ContractVehicleRecord = {
  name: string;
  contractNumber: string;
  vehicleType: string;
  awardingAgency: string;
  startDate: string;
  endDate: string;
  status: string;
  source: string;
  sourceUrl?: string | null;
};

export type KnownContractRecord = {
  name: string;
  contractNumber: string;
  agency: string;
  role: "prime" | "subcontractor" | "unknown";
  awardValue: string;
  ceilingValue: string;
  awardDate: string;
  periodOfPerformance: string;
  capabilityArea: string;
  source: string;
  sourceUrl?: string | null;
  status: string;
  contractType:
    | "standalone_contract"
    | "idiq"
    | "bpa"
    | "task_order"
    | "delivery_order"
    | "contract_vehicle"
    | "unknown";
};

export type ResearchOpportunityRecord = {
  title: string;
  noticeNumber: string;
  agency: string;
  dueDate: string;
  naics: string;
  setAside: string;
  estimatedValue: string;
  relevantCapability: string;
  sourceUrl: string;
  nm2techMatch: string;
};

export type SuggestedOwner = {
  name: string;
  evidence: string;
};

export type PartnerFitResult = {
  score: number;
  priority: "High" | "Medium" | "Low";
  relationshipType: string;
  whyCompanyMatters: string;
  nm2techCanBring: string[];
  outreachAngle: string;
  signals: string[];
};

export type ResearchCandidate = {
  legalName: string;
  uei?: string | null;
  cageCode?: string | null;
  location?: string | null;
  website?: string | null;
  source: string;
  recipientHash?: string | null;
};

export type ResearchChecklist = {
  companyIdentified: boolean;
  ueiVerified: boolean;
  cageVerified: boolean;
  naicsCount: number;
  agencyCount: number;
  vehicleCount: number;
  contractsFound: boolean;
  partnerFitCalculated: boolean;
};

export type ResearchSummaryCounts = {
  populated: number;
  verified: number;
  needsReview: number;
  notFound: number;
};

export type ResearchMode = "full" | "refresh";

export type LeadResearchSnapshot = {
  mode: ResearchMode;
  researchedAt: string;
  query: { companyName: string; website: string };
  companyName: string;
  legalCompanyName: string;
  website: string;
  linkedinUrl: string;
  headquarters: string;
  companyDescription: string;
  marketAgency: string;
  smallBusinessStatuses: string[];
  uei: string;
  cageCode: string;
  naics: NaicsEntry[];
  capabilityTags: string[];
  agencies: AgencyEntry[];
  vehicles: ContractVehicleRecord[];
  contracts: KnownContractRecord[];
  opportunities: ResearchOpportunityRecord[];
  opportunitiesVerified: boolean;
  pastPerformanceTags: string[];
  technologyTags: string[];
  suggestedRelationshipOwner: SuggestedOwner | null;
  partnerFit: PartnerFitResult;
  facts: Record<string, ResearchFact>;
  checklist: ResearchChecklist;
  summary: ResearchSummaryCounts;
  sourcesUsed: Array<{ label: string; url?: string | null; type: ResearchSourceType }>;
};

export type ResearchDisambiguation = {
  status: "needs_disambiguation";
  candidates: ResearchCandidate[];
  query: { companyName: string; website: string };
};

export type ResearchComplete = {
  status: "complete";
  snapshot: LeadResearchSnapshot;
};

export type ResearchResult = ResearchDisambiguation | ResearchComplete;

export type FieldDecision = "keep" | "researched" | "merge";

export type ResearchFieldConflict = {
  field: string;
  label: string;
  existing: string;
  researched: string;
  mergeValue?: string | null;
};

export const RESEARCH_FIELD_KEYS = [
  "companyName",
  "legalCompanyName",
  "website",
  "linkedinUrl",
  "headquarters",
  "companyDescription",
  "marketAgency",
  "smallBusinessStatuses",
  "uei",
  "cageCode",
  "naics",
  "capabilityTags",
  "agencies",
  "vehicles",
  "contracts",
  "opportunities",
  "pastPerformanceTags",
  "technologyTags",
] as const;

export type ResearchFieldKey = (typeof RESEARCH_FIELD_KEYS)[number];

export type LeadGraphEntityType =
  | "company"
  | "person"
  | "agency"
  | "bureau"
  | "capability"
  | "technology"
  | "naics"
  | "contract_vehicle"
  | "contract"
  | "task_order"
  | "opportunity"
  | "relationship"
  | "source";

export type LeadGraphRelationshipType =
  | "SERVES"
  | "HOLDS"
  | "WON"
  | "ISSUED_BY"
  | "HAS_CAPABILITY"
  | "USES"
  | "REGISTERED_UNDER"
  | "MATCHES"
  | "HAS_RELATIONSHIP_WITH";

export type LeadResearchRun = {
  id: string;
  business_profile_id: string;
  lead_id: string | null;
  mode: ResearchMode;
  query_company_name: string | null;
  query_website: string | null;
  status: string;
  summary: ResearchSummaryCounts | Record<string, unknown> | null;
  partner_fit: PartnerFitResult | Record<string, unknown> | null;
  snapshot: LeadResearchSnapshot | Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
};
