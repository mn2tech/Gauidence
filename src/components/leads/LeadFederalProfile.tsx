"use client";

import type { BusinessLead } from "@/lib/leads/types";

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <p className="text-sm">
      <span className="text-ink-muted">{label}: </span>
      {value}
    </p>
  );
}

export default function LeadFederalProfile({ lead }: { lead: BusinessLead }) {
  if (lead.lead_type !== "federal_partner") return null;
  const hasAny = [
    lead.relationship_owner,
    lead.small_business_status,
    lead.uei,
    lead.cage_code,
    lead.naics_codes,
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
        Add federal partner details in Edit — UEI, CAGE, NAICS, agencies, and
        capabilities help Gideon score the match.
      </p>
    );
  }
  return (
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
      <Row label="Owner" value={lead.relationship_owner} />
      <Row label="Small business status" value={lead.small_business_status} />
      <Row label="Market / Agency" value={lead.market_agency} />
      <Row label="UEI" value={lead.uei} />
      <Row label="CAGE" value={lead.cage_code} />
      <Row label="NAICS" value={lead.naics_codes} />
      <Row label="Agencies served" value={lead.federal_agencies_served} />
      <Row label="Capabilities" value={lead.primary_capabilities} />
      <Row label="Contract vehicles" value={lead.contract_vehicles} />
      <Row label="Known contracts" value={lead.known_contracts} />
      <Row label="Current opportunities" value={lead.current_opportunities} />
      <Row label="Past performance" value={lead.past_performance_areas} />
      <Row label="Technology areas" value={lead.technology_areas} />
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
