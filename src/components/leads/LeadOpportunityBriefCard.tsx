"use client";

import { Loader2, Sparkles } from "lucide-react";
import {
  EVIDENCE_KIND_LABELS,
  type LeadOpportunityBrief,
  type LeadPotentialNeed,
} from "@/lib/leads/opportunity";
import type { BusinessLead } from "@/lib/leads/types";

const buttonSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-stone-50 disabled:opacity-50";

function parseBriefFromLead(lead: BusinessLead): LeadOpportunityBrief | null {
  const raw = lead.opportunity_brief;
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (!b.primaryNeed && !b.recommendedService) return null;
  return {
    companySummary: String(b.companySummary ?? ""),
    primaryNeed: String(b.primaryNeed ?? lead.opportunity_summary ?? ""),
    potentialNeeds: Array.isArray(b.potentialNeeds)
      ? (b.potentialNeeds as LeadPotentialNeed[])
      : [],
    recommendedService: String(
      b.recommendedService ?? lead.recommended_service ?? ""
    ),
    reasoning: String(b.reasoning ?? ""),
    conversationAngle: String(
      b.conversationAngle ?? lead.conversation_angle ?? ""
    ),
    suggestedOpening: String(b.suggestedOpening ?? ""),
    leadScore:
      typeof b.leadScore === "number"
        ? b.leadScore
        : (lead.lead_score ?? 0),
    nextBestAction: String(b.nextBestAction ?? lead.next_action ?? ""),
    analyzedAt: b.analyzedAt ? String(b.analyzedAt) : undefined,
  };
}

type Props = {
  lead: BusinessLead;
  analyzing: boolean;
  error: string | null;
  onAnalyze: () => void;
};

export default function LeadOpportunityBriefCard({
  lead,
  analyzing,
  error,
  onAnalyze,
}: Props) {
  const brief = parseBriefFromLead(lead);
  const hasBrief =
    brief != null ||
    lead.opportunity_summary ||
    lead.recommended_service ||
    lead.lead_score != null;

  const grouped = {
    observed: brief?.potentialNeeds?.filter((n) => n.kind === "observed") ?? [],
    inferred: brief?.potentialNeeds?.filter((n) => n.kind === "inferred") ?? [],
    unknown: brief?.potentialNeeds?.filter((n) => n.kind === "unknown") ?? [],
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand" />
          <h2 className="font-semibold">AI Opportunity Brief</h2>
        </div>
        {lead.lead_score != null ? (
          <p className="text-sm font-semibold text-brand">
            Lead score: {lead.lead_score} / 100
          </p>
        ) : null}
      </div>

      {!hasBrief ? (
        <p className="mt-3 text-sm text-ink-muted">
          Let Gideon research this company, identify a potential opportunity, and
          suggest what to do next.
        </p>
      ) : (
        <div className="mt-4 space-y-4 text-sm">
          {brief?.companySummary ? (
            <p className="text-ink-muted">{brief.companySummary}</p>
          ) : null}

          <div>
            <p className="font-medium">Potential need</p>
            <p className="mt-1 text-ink-muted">
              {brief?.primaryNeed ?? lead.opportunity_summary ?? "—"}
            </p>
          </div>

          {brief?.reasoning ? (
            <div>
              <p className="font-medium">Why</p>
              <p className="mt-1 text-ink-muted">{brief.reasoning}</p>
            </div>
          ) : null}

          {(brief?.recommendedService || lead.recommended_service) ? (
            <div>
              <p className="font-medium">Recommended service</p>
              <p className="mt-1 text-ink-muted">
                {brief?.recommendedService ?? lead.recommended_service}
              </p>
            </div>
          ) : null}

          {(brief?.conversationAngle || lead.conversation_angle) ? (
            <div>
              <p className="font-medium">Conversation angle</p>
              <p className="mt-1 text-ink-muted">
                {brief?.conversationAngle ?? lead.conversation_angle}
              </p>
            </div>
          ) : null}

          {(["observed", "inferred", "unknown"] as const).map((kind) =>
            grouped[kind].length > 0 ? (
              <div key={kind}>
                <p className="font-medium">{EVIDENCE_KIND_LABELS[kind]}</p>
                <ul className="mt-1 space-y-1 text-ink-muted">
                  {grouped[kind].map((need, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">
                        {need.label}:
                      </span>{" "}
                      {need.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          )}

          {(brief?.nextBestAction || lead.next_action) ? (
            <div className="rounded-xl border border-brand/20 bg-brand-light/40 p-4">
              <p className="font-medium">Next best action</p>
              <p className="mt-1 text-ink-muted">
                {brief?.nextBestAction ?? lead.next_action}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={analyzing}
        onClick={onAnalyze}
        className={`mt-4 ${buttonSecondary}`}
      >
        {analyzing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {hasBrief ? "Refresh opportunity" : "Find Opportunity"}
      </button>
    </div>
  );
}
