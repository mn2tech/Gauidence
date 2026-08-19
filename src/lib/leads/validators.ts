import {
  LEAD_ACTIVITY_TYPES,
  LEAD_STATUSES,
  LEAD_TYPES,
  type LeadActivityType,
  type LeadStatus,
  type LeadType,
} from "@/lib/leads/types";

export function parseUuid(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    trimmed
  )
    ? trimmed
    : null;
}

export function parseOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseLeadStatus(value: unknown): LeadStatus | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  return LEAD_STATUSES.includes(normalized as LeadStatus)
    ? (normalized as LeadStatus)
    : null;
}

export function parseLeadSearchQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 ? trimmed : null;
}

export function parseCompanyOrContact(
  companyName: unknown,
  contactName: unknown
): { companyName: string | null; contactName: string | null } | null {
  const company = parseOptionalText(companyName);
  const contact = parseOptionalText(contactName);
  if (!company && !contact) return null;
  return { companyName: company, contactName: contact };
}

export function parseLeadType(value: unknown): LeadType | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "federal" || normalized === "federal_partner") {
    return "federal_partner";
  }
  return LEAD_TYPES.includes(normalized as LeadType)
    ? (normalized as LeadType)
    : null;
}

export function parseLeadActivityType(value: unknown): LeadActivityType | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  return LEAD_ACTIVITY_TYPES.includes(normalized as LeadActivityType)
    ? (normalized as LeadActivityType)
    : null;
}

export function parseSmallBusinessStatus(value: unknown): string | null {
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => parseOptionalText(v))
      .filter((v): v is string => Boolean(v));
    return parts.length > 0 ? parts.join(", ") : null;
  }
  const text = parseOptionalText(value);
  if (!text) return null;
  return text;
}

export function parseOptionalDate(value: unknown): string | null {
  const text = parseOptionalText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function parseOptionalScore(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function parseLeadProfileFields(
  body: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const textFields: Array<[string, string[]]> = [
    ["linkedin_url", ["linkedinUrl", "linkedin_url", "linkedin"]],
    ["legal_company_name", ["legalCompanyName", "legal_company_name"]],
    ["company_description", ["companyDescription", "company_description"]],
    ["headquarters", ["headquarters"]],
    ["primary_naics", ["primaryNaics", "primary_naics"]],
    ["recommended_outreach_angle", ["recommendedOutreachAngle", "recommended_outreach_angle"]],
    ["why_company_matters", ["whyCompanyMatters", "why_company_matters"]],
    ["nm2tech_can_bring", ["nm2techCanBring", "nm2tech_can_bring"]],
    ["relationship_owner", ["relationshipOwner", "relationship_owner", "owner"]],
    ["uei", ["uei"]],
    ["cage_code", ["cageCode", "cage_code"]],
    ["naics_codes", ["naicsCodes", "naics_codes", "naics"]],
    ["primary_capabilities", ["primaryCapabilities", "primary_capabilities"]],
    [
      "federal_agencies_served",
      ["federalAgenciesServed", "federal_agencies_served", "agencies"],
    ],
    ["contract_vehicles", ["contractVehicles", "contract_vehicles"]],
    ["known_contracts", ["knownContracts", "known_contracts"]],
    ["current_opportunities", ["currentOpportunities", "current_opportunities"]],
    ["past_performance_areas", ["pastPerformanceAreas", "past_performance_areas"]],
    ["technology_areas", ["technologyAreas", "technology_areas"]],
    ["market_agency", ["marketAgency", "market_agency", "agency"]],
    ["match_explanation", ["matchExplanation", "match_explanation"]],
    ["recommended_approach", ["recommendedApproach", "recommended_approach"]],
    ["next_action", ["nextAction", "next_action"]],
  ];
  for (const [column, keys] of textFields) {
    for (const key of keys) {
      if (body[key] !== undefined) {
        out[column] = parseOptionalText(body[key]);
        break;
      }
    }
  }
  if (body.smallBusinessStatus !== undefined || body.small_business_status !== undefined || body.smallBusinessStatuses !== undefined) {
    out.small_business_status = parseSmallBusinessStatus(
      body.smallBusinessStatuses ?? body.smallBusinessStatus ?? body.small_business_status
    );
  }
  if (body.nextActionDate !== undefined || body.next_action_date !== undefined) {
    out.next_action_date = parseOptionalDate(
      body.nextActionDate ?? body.next_action_date
    );
  }
  return out;
}

export function parseResearchSnapshot(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.researchedAt !== "string" && typeof row.companyName !== "string") {
    return null;
  }
  return row;
}
