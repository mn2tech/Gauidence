"use client";

import type { BusinessLead } from "@/lib/leads/types";
import type { ResearchConfidence } from "@/lib/leads/research/types";

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <p className="text-sm">
      <span className="text-ink-muted">{label}: </span>
      {value}
    </p>
  );
}

function factBadge(
  facts: Record<string, { confidence?: ResearchConfidence }> | undefined,
  key: string
): string | null {
  const confidence = facts?.[key]?.confidence;
  if (!confidence || confidence === "not_found") return null;
  if (confidence === "verified") return "✓ Verified";
  if (confidence === "high") return "● High";
  return "△ Review";
}

export default function LeadFederalProfile({ lead }: { lead: BusinessLead }) {
  if (lead.lead_type !== "federal_partner") return null;
  const data = (lead.federal_profile_data ?? {}) as {
    facts?: Record<string, { confidence?: ResearchConfidence }>;
    vehicles?: Array<{ name: string; contractNumber?: string }>;
    contracts?: Array<{ name?: string; contractNumber?: string }>;
    opportunities?: Array<{ title: string }>;
    opportunitiesVerified?: boolean;
  };
  const hasAny = [
    lead.legal_company_name,
    lead.company_description,
    lead.headquarters,
    lead.relationship_owner,
    lead.small_business_status,
    lead.uei,
    lead.cage_code,
    lead.naics_codes,
    lead.primary_naics,
    lead.primary_capabilities,
    lead.federal_agencies_served,
    lead.contract_vehicles,
    lead.known_contracts,
    lead.current_opportunities,
    lead.past_performance_areas,
    lead.technology_areas,
    lead.market_agency,
    lead.linkedin_url,
  ].some((v) => Boolean(v?.trim()));
  if (!hasAny) {
    return (
      <p className="mt-4 text-sm text-ink-muted">
        Use Research & Auto-Fill in Edit to pull SAM.gov / USASpending data, then
        review before saving. UEI, CAGE, NAICS, agencies, and capabilities help
        Gideon score the match.
      </p>
    );
  }
  const facts = data.facts;
  const badge = (key: string) => {
    const text = factBadge(facts, key);
    return text ? (
      <span className="ml-2 text-[11px] font-medium text-ink-muted">{text}</span>
    ) : null;
  };
  return (
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
      <Row label="Legal name" value={lead.legal_company_name} />
      <Row label="Headquarters" value={lead.headquarters} />
      <p className="text-sm sm:col-span-2">
        <span className="text-ink-muted">Owner: </span>
        {lead.relationship_owner?.trim() || "Unassigned"}
      </p>
      <p className="text-sm">
        <span className="text-ink-muted">Small business status: </span>
        {lead.small_business_status || "Unknown"}
        {badge("smallBusinessStatuses")}
      </p>
      <Row label="Market / Agency" value={lead.market_agency} />
      <p className="text-sm">
        <span className="text-ink-muted">UEI: </span>
        {lead.uei || "—"}
        {badge("uei")}
      </p>
      <p className="text-sm">
        <span className="text-ink-muted">CAGE: </span>
        {lead.cage_code || "—"}
        {badge("cageCode")}
      </p>
      <p className="text-sm sm:col-span-2">
        <span className="text-ink-muted">NAICS: </span>
        {lead.naics_codes || lead.primary_naics || "—"}
        {badge("naics")}
      </p>
      <Row label="Agencies served" value={lead.federal_agencies_served} />
      <Row label="Capabilities" value={lead.primary_capabilities} />
      <Row label="Contract vehicles" value={lead.contract_vehicles} />
      <Row label="Known contracts" value={lead.known_contracts} />
      <Row
        label="Current opportunities"
        value={
          data.opportunitiesVerified && (data.opportunities?.length ?? 0) === 0
            ? "No current opportunities verified"
            : lead.current_opportunities
        }
      />
      <Row label="Past performance" value={lead.past_performance_areas} />
      <Row label="Technology areas" value={lead.technology_areas} />
      {lead.company_description ? (
        <p className="text-sm sm:col-span-2">
          <span className="text-ink-muted">Description: </span>
          {lead.company_description}
        </p>
      ) : null}
      {lead.linkedin_url ? (
        <p className="text-sm">
          <span className="text-ink-muted">LinkedIn: </span>
          <a
            href={lead.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            Profile
          </a>
        </p>
      ) : null}
    </div>
  );
}
