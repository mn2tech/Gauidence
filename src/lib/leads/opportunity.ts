export const LEAD_OPPORTUNITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "companySummary",
    "primaryNeed",
    "potentialNeeds",
    "recommendedService",
    "reasoning",
    "conversationAngle",
    "suggestedOpening",
    "leadScore",
    "nextBestAction",
  ],
  properties: {
    companySummary: { type: "string" },
    primaryNeed: { type: "string" },
    potentialNeeds: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "kind", "detail"],
        properties: {
          label: { type: "string" },
          kind: { type: "string", enum: ["observed", "inferred", "unknown"] },
          detail: { type: "string" },
        },
      },
    },
    recommendedService: { type: "string" },
    reasoning: { type: "string" },
    conversationAngle: { type: "string" },
    suggestedOpening: { type: "string" },
    leadScore: { type: "number" },
    nextBestAction: { type: "string" },
  },
} as const;

export type LeadEvidenceKind = "observed" | "inferred" | "unknown";

export type LeadPotentialNeed = {
  label: string;
  kind: LeadEvidenceKind;
  detail: string;
};

export type LeadOpportunityBrief = {
  companySummary: string;
  primaryNeed: string;
  potentialNeeds: LeadPotentialNeed[];
  recommendedService: string;
  reasoning: string;
  conversationAngle: string;
  suggestedOpening: string;
  leadScore: number;
  nextBestAction: string;
  analyzedAt?: string;
};

export function isLeadEvidenceKind(value: string): value is LeadEvidenceKind {
  return value === "observed" || value === "inferred" || value === "unknown";
}

export const EVIDENCE_KIND_LABELS: Record<LeadEvidenceKind, string> = {
  observed: "Observed",
  inferred: "Inferred",
  unknown: "Unknown",
};

function clampLeadScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pickString(
  parsed: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parsePotentialNeeds(raw: unknown): LeadPotentialNeed[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 8)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const kind = String(row.kind ?? "inferred").toLowerCase();
      return {
        label: pickString(row, "label"),
        kind: isLeadEvidenceKind(kind) ? kind : "inferred",
        detail: pickString(row, "detail"),
      };
    })
    .filter(
      (need): need is LeadPotentialNeed =>
        need != null && need.label.length > 0 && need.detail.length > 0
    );
}

/** Parse Gideon opportunity brief JSON from chat or structured output. */
export function parseLeadOpportunityBrief(
  raw: string | Record<string, unknown>
): LeadOpportunityBrief | null {
  let parsed: Record<string, unknown>;
  if (typeof raw === "string") {
    const trimmed = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    if (!trimmed) return null;
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else {
    parsed = raw;
  }

  const primaryNeed = pickString(
    parsed,
    "primaryNeed",
    "primary_need",
    "opportunity",
    "opportunitySummary",
    "opportunity_summary"
  );
  const recommendedService = pickString(
    parsed,
    "recommendedService",
    "recommended_service",
    "service",
    "serviceRecommendation",
    "service_recommendation"
  );
  if (!primaryNeed && !recommendedService) return null;

  return {
    companySummary: pickString(
      parsed,
      "companySummary",
      "company_summary",
      "summary"
    ),
    primaryNeed,
    potentialNeeds: parsePotentialNeeds(
      parsed.potentialNeeds ?? parsed.potential_needs
    ),
    recommendedService,
    reasoning: pickString(parsed, "reasoning", "why"),
    conversationAngle: pickString(
      parsed,
      "conversationAngle",
      "conversation_angle",
      "angle"
    ),
    suggestedOpening: pickString(
      parsed,
      "suggestedOpening",
      "suggested_opening",
      "opening"
    ),
    leadScore: clampLeadScore(parsed.leadScore ?? parsed.lead_score),
    nextBestAction: pickString(
      parsed,
      "nextBestAction",
      "next_best_action",
      "nextAction",
      "next_action"
    ),
    analyzedAt: new Date().toISOString(),
  };
}
