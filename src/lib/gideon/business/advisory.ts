/**
 * Advisory / chief-of-staff priority ranking for "What should I focus on next?"
 * Priority ≈ Urgency × Business Impact × Confidence (internal ranking only).
 */

import type { ProposalFollowUpCandidate } from "./types";
import type { AdvisoryInsight, GideonClaim } from "./types";

export function buildAdvisoryInsights(args: {
  proposalFollowUps: ProposalFollowUpCandidate[];
  commitmentDueSoon: Array<{
    clientName: string;
    description: string;
    dueDate: string;
    status: string;
  }>;
  risks: Array<{
    title: string;
    summary: string;
    entityId?: string;
    evidenceLabel?: string;
  }>;
  gaps: Array<{ title: string; summary: string }>;
}): { insights: AdvisoryInsight[]; claims: GideonClaim[] } {
  const insights: AdvisoryInsight[] = [];

  for (const p of args.proposalFollowUps.slice(0, 8)) {
    const urgency = Math.min(1, p.score / 12);
    const businessImpact = p.amountLabel ? 0.8 : 0.55;
    const confidence = Math.min(0.95, 0.55 + p.score / 20);
    const priority = urgency * businessImpact * confidence;
    insights.push({
      type: "proposal_follow_up",
      entityId: p.proposalId,
      title: `${p.clientName} — ${p.title}`,
      summary: p.reasons.join(" "),
      priority,
      urgency,
      businessImpact,
      confidence,
      why: p.reasons.join(" "),
      evidence: [
        {
          sourceId: p.proposalId,
          sourceType: "proposal",
          label: p.title,
          href: `/proposals/${p.proposalId}`,
        },
      ],
      recommendedNextStep: p.recommendedAction,
      suggestedActions: [
        { id: "draft_follow_up", label: "Draft Follow-Up" },
        { id: "create_task", label: "Create Task" },
        { id: "schedule_reminder", label: "Schedule Reminder" },
      ],
    });
  }

  for (const c of args.commitmentDueSoon.slice(0, 6)) {
    const urgency = 0.85;
    const businessImpact = 0.7;
    const confidence = 0.75;
    insights.push({
      type: "commitment_due",
      entityId: null,
      title: `${c.clientName}: ${c.description}`,
      summary: `Commitment status ${c.status}; due ${c.dueDate}.`,
      priority: urgency * businessImpact * confidence,
      urgency,
      businessImpact,
      confidence,
      why: `Commitment approaching due date (${c.dueDate}).`,
      evidence: [
        {
          sourceId: c.clientName,
          sourceType: "commitment",
          label: c.description,
          reference: c.dueDate,
        },
      ],
      recommendedNextStep: `Confirm progress on "${c.description}" with ${c.clientName}.`,
      suggestedActions: [
        { id: "create_task", label: "Create Task" },
        { id: "assign_owner", label: "Assign Owner" },
      ],
    });
  }

  for (const r of args.risks.slice(0, 5)) {
    const urgency = 0.8;
    const businessImpact = 0.85;
    const confidence = 0.65;
    insights.push({
      type: "unresolved_risk",
      entityId: r.entityId ?? null,
      title: r.title,
      summary: r.summary,
      priority: urgency * businessImpact * confidence,
      urgency,
      businessImpact,
      confidence,
      why: "Unresolved risk or security finding in Guardian knowledge.",
      evidence: r.evidenceLabel
        ? [
            {
              sourceId: r.entityId ?? r.title,
              sourceType: "ontology_entity",
              label: r.evidenceLabel,
            },
          ]
        : [],
      recommendedNextStep: `Verify whether remediation for "${r.title}" was completed.`,
      suggestedActions: [
        { id: "create_task", label: "Create Task" },
        { id: "dismiss", label: "Dismiss" },
      ],
    });
  }

  for (const g of args.gaps.slice(0, 4)) {
    insights.push({
      type: "missing_information",
      entityId: null,
      title: g.title,
      summary: g.summary,
      priority: 0.25,
      urgency: 0.4,
      businessImpact: 0.4,
      confidence: 0.5,
      why: g.summary,
      evidence: [],
      recommendedNextStep: g.summary,
    });
  }

  insights.sort((a, b) => b.priority - a.priority);

  const claims: GideonClaim[] = insights.slice(0, 8).map((insight) => ({
    claim: insight.title,
    kind: "RECOMMENDATION",
    confidence: insight.confidence,
    evidence: insight.evidence,
  }));

  // Also attach fact claims from proposal follow-ups
  for (const p of args.proposalFollowUps.slice(0, 5)) {
    claims.push({
      claim: `${p.clientName} has open proposal "${p.title}" needing follow-up.`,
      kind: "KNOWN_FACT",
      confidence: 0.85,
      evidence: [
        {
          sourceId: p.proposalId,
          sourceType: "proposal",
          label: p.title,
          href: `/proposals/${p.proposalId}`,
        },
      ],
    });
  }

  return { insights, claims };
}
