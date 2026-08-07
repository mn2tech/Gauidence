import { randomUUID } from "node:crypto";
import type {
  ProposalDeliverable,
  ProposalLineItem,
  ProposalTimelineItem,
} from "@/lib/proposals/types";
import type { BusinessAssessmentDetail } from "./types";

export const PAID_ASSESSMENT_SERVICE_KEY = "paid_website_assessment";
export const REDESIGN_SPRINT_SERVICE_KEY = "website_redesign_sprint";
export const PAID_ASSESSMENT_PRICE_CENTS = 9900;

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function sortFindingsBySeverity<
  T extends { severity: string },
>(findings: T[]): T[] {
  return [...findings].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
  );
}

function formatFindingBullets(
  findings: BusinessAssessmentDetail["findings"],
  max = 8
): string {
  return sortFindingsBySeverity(findings)
    .slice(0, max)
    .map((f) => {
      const fix = f.recommendation?.trim() || f.business_impact?.trim();
      return fix ? `• ${f.title}: ${fix}` : `• ${f.title}`;
    })
    .join("\n");
}

export function buildFindingDeliverables(
  findings: BusinessAssessmentDetail["findings"]
): ProposalDeliverable[] {
  return sortFindingsBySeverity(findings).map((f, index) => ({
    id: randomUUID(),
    title: f.recommendation?.trim()
      ? f.recommendation.trim().slice(0, 120)
      : f.title,
    description: [f.description, f.business_impact].filter(Boolean).join(" — "),
    sortOrder: index,
  }));
}

export type ClientReadyProposalDraft = {
  title: string;
  summary: string | null;
  introduction: string;
  terms: string;
  lineItems: ProposalLineItem[];
  deliverables: ProposalDeliverable[];
  timeline: ProposalTimelineItem[];
};

/** Build client-facing proposal content from a completed assessment. */
export function buildClientReadyProposalContent(
  detail: BusinessAssessmentDetail
): ClientReadyProposalDraft {
  const sortedFindings = sortFindingsBySeverity(detail.findings);
  const findingBullets = formatFindingBullets(sortedFindings);
  const outcomesSummary = detail.outcomes
    .map((o) => `• ${o.outcome_text}`)
    .join("\n");

  const implementationCents = detail.solutions.reduce(
    (sum, s) => sum + s.price_cents,
    0
  );
  const hasImplementation = sortedFindings.length > 0 || implementationCents > 0;

  const assessmentDescription = [
    "Everything in your free website review package.",
    "Written priority plan based on your scan results.",
    "15-minute walkthrough call or Loom recording.",
    "$99 fully credited toward implementation if you proceed within 30 days.",
  ].join("\n");

  const lineItems: ProposalLineItem[] = [
    {
      id: randomUUID(),
      title: "Website & Conversion Assessment",
      description: assessmentDescription,
      quantity: 1,
      unitLabel: "assessment",
      unitPriceCents: PAID_ASSESSMENT_PRICE_CENTS,
    },
  ];

  if (hasImplementation) {
    const implementationDescription = [
      "Scoped implementation addressing the priority items from your website review:",
      "",
      findingBullets || "• Improvements aligned with your assessment outcomes.",
      "",
      "Includes design, development, QA, and launch support for the agreed homepage and conversion improvements.",
    ].join("\n");

    lineItems.push({
      id: randomUUID(),
      title: "Homepage Trust & Conversion Improvements",
      description: implementationDescription,
      quantity: 1,
      unitLabel: "project",
      unitPriceCents: Math.max(implementationCents, 450_000),
    });
  }

  const findingsSummary = sortedFindings
    .slice(0, 8)
    .map((f) => `• ${f.title}: ${f.description}`)
    .join("\n");

  const introduction = [
    detail.executive_summary,
    "",
    "## What we found",
    findingsSummary || "Your website review identified opportunities to improve trust, clarity, and conversions.",
    outcomesSummary ? `\n## Outcomes we will deliver\n${outcomesSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const deliverables: ProposalDeliverable[] = [
    {
      id: randomUUID(),
      title: "Website & Conversion Assessment",
      description:
        "Review results walkthrough, written priority plan, and credited assessment fee.",
      sortOrder: 0,
    },
    ...buildFindingDeliverables(sortedFindings).map((d, i) => ({
      ...d,
      sortOrder: i + 1,
    })),
  ];

  const timeline: ProposalTimelineItem[] = [
    {
      id: randomUUID(),
      title: "Assessment & priority plan",
      description:
        "Review findings together, confirm scope, and sequence the highest-impact fixes.",
      sortOrder: 0,
    },
    {
      id: randomUUID(),
      title: "Design & build",
      description:
        "Implement agreed homepage trust, content, and conversion improvements.",
      sortOrder: 1,
    },
    {
      id: randomUUID(),
      title: "Launch & handoff",
      description: "QA, go-live support, and documentation for your team.",
      sortOrder: 2,
    },
  ];

  return {
    title: `${detail.company_name} — Website Review & Improvement Proposal`,
    summary:
      detail.executive_summary?.slice(0, 500) ??
      `A phased plan to address findings from the website review of ${detail.website_url}.`,
    introduction,
    terms:
      "The $99 assessment fee is credited toward implementation if you proceed within 30 days. Final scope is confirmed during the assessment walkthrough. Pricing valid for 30 days.",
    lineItems,
    deliverables,
    timeline,
  };
}
