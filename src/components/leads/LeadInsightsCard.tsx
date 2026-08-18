"use client";

import { missingLeadFacts, type BusinessLead } from "@/lib/leads/types";

export default function LeadInsightsCard({ lead }: { lead: BusinessLead }) {
  const missing = missingLeadFacts(lead);
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">AI Insights</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Recommendations stay labeled as recommendations. Missing facts are from
        this record only.
      </p>
      <div className="mt-4 space-y-3 text-sm">
        <div>
          <p className="font-medium">Recommended next action</p>
          <p className="mt-1 text-ink-muted">
            {lead.next_action?.trim() ||
              lead.recommended_approach ||
              "No next action yet. Use Suggest one, or Research Company."}
          </p>
        </div>
        {lead.match_explanation ? (
          <div>
            <p className="font-medium">Relationship summary</p>
            <p className="mt-1 text-ink-muted">{lead.match_explanation}</p>
          </div>
        ) : null}
        {lead.opportunity_summary ? (
          <div>
            <p className="font-medium">Potential opportunity</p>
            <p className="mt-1 text-ink-muted">{lead.opportunity_summary}</p>
          </div>
        ) : null}
        {lead.recommended_service ? (
          <div>
            <p className="font-medium">Potential NM2TECH offering</p>
            <p className="mt-1 text-ink-muted">{lead.recommended_service}</p>
          </div>
        ) : null}
        {missing.length > 0 ? (
          <div>
            <p className="font-medium">Missing information</p>
            <p className="mt-1 text-ink-muted">{missing.join(" · ")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
