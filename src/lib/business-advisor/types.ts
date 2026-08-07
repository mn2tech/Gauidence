export const ASSESSMENT_STATUSES = [
  "draft",
  "analyzing",
  "complete",
  "failed",
] as const;

export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export type AssessmentFinding = {
  id: string;
  assessment_id: string;
  analyzer: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  business_impact: string | null;
  recommendation: string | null;
  raw_data: Record<string, unknown>;
  created_at: string;
};

export type BusinessOpportunity = {
  id: string;
  assessment_id: string;
  finding_id: string | null;
  title: string;
  description: string;
  category: string;
  estimated_impact: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  priority: number;
  potential_outcome: string | null;
  guardian_solution_key: string | null;
  created_at: string;
};

export type RecommendedSolution = {
  id: string;
  assessment_id: string;
  service_key: string;
  title: string;
  description: string | null;
  reason: string | null;
  business_value: string | null;
  estimated_roi: string | null;
  implementation_time: string | null;
  price_cents: number;
  hours: number | null;
  sort_order: number;
  created_at: string;
};

export type BusinessOutcome = {
  id: string;
  assessment_id: string;
  outcome_text: string;
  measurable_metric: string | null;
  sort_order: number;
  created_at: string;
};

export type BusinessAssessment = {
  id: string;
  business_profile_id: string;
  client_profile_id: string | null;
  created_by: string;
  company_name: string;
  website_url: string;
  industry: string | null;
  status: AssessmentStatus;
  executive_summary: string | null;
  report_json: Record<string, unknown>;
  error_message: string | null;
  analyzed_at: string | null;
  proposal_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessAssessmentDetail = BusinessAssessment & {
  findings: AssessmentFinding[];
  opportunities: BusinessOpportunity[];
  solutions: RecommendedSolution[];
  outcomes: BusinessOutcome[];
  client_name?: string | null;
};

export const ASSESSMENT_SELECT =
  "id, business_profile_id, client_profile_id, created_by, company_name, website_url, industry, status, executive_summary, report_json, error_message, analyzed_at, proposal_id, created_at, updated_at";

export const CATALOG_SELECT =
  "id, business_profile_id, service_key, name, category, description, estimated_hours, hourly_rate_cents, minimum_price_cents, maximum_price_cents, subscription_monthly_cents, is_active, created_at, updated_at";

export type AdvisorServiceCatalogItem = {
  id: string;
  business_profile_id: string;
  service_key: string;
  name: string;
  category: string;
  description: string | null;
  estimated_hours: number;
  hourly_rate_cents: number;
  minimum_price_cents: number;
  maximum_price_cents: number | null;
  subscription_monthly_cents: number | null;
  is_active: boolean;
};
