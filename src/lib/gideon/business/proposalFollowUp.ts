/**
 * Proposal follow-up scoring — configurable signals, returns WHY.
 */

import type { Proposal } from "@/lib/proposals/types";
import { formatMoney } from "@/lib/proposals/pricing";
import type { ProposalFollowUpCandidate, GideonClaim } from "./types";

export type ProposalFollowUpConfig = {
  staleDays: number;
  openStatuses: ReadonlySet<string>;
  weights: {
    sentOrViewed: number;
    noWorkProject: number;
    staleUpdate: number;
    followUpPassed: number;
    noRecentView: number;
    highValue: number;
  };
  highValueCents: number;
};

export const DEFAULT_PROPOSAL_FOLLOW_UP_CONFIG: ProposalFollowUpConfig = {
  staleDays: 7,
  openStatuses: new Set(["sent", "viewed", "changes_requested"]),
  weights: {
    sentOrViewed: 2,
    noWorkProject: 3,
    staleUpdate: 2,
    followUpPassed: 3,
    noRecentView: 1,
    highValue: 1,
  },
  highValueCents: 400_000, // $4,000
};

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((now.getTime() - t) / (1000 * 60 * 60 * 24));
}

function readFollowUpAt(proposal: Proposal): string | null {
  const meta = proposal.external_metadata ?? {};
  for (const key of ["follow_up_at", "followUpAt", "next_follow_up_at"]) {
    const raw = meta[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

export function scoreProposalFollowUp(
  proposal: Proposal,
  args: {
    clientName: string;
    now?: Date;
    config?: ProposalFollowUpConfig;
    hasActiveProject?: boolean;
    hasContract?: boolean;
  }
): ProposalFollowUpCandidate | null {
  const config = args.config ?? DEFAULT_PROPOSAL_FOLLOW_UP_CONFIG;
  const now = args.now ?? new Date();

  if (!config.openStatuses.has(proposal.status)) {
    return null;
  }

  let score = 0;
  const reasons: string[] = [];

  if (proposal.status === "sent" || proposal.status === "viewed") {
    score += config.weights.sentOrViewed;
    reasons.push(`Proposal status is ${proposal.status}.`);
  }

  if (!proposal.work_project_id && !args.hasActiveProject) {
    score += config.weights.noWorkProject;
    reasons.push("No active project is linked to this proposal.");
  }

  if (!args.hasContract) {
    // Mild signal — don't invent contracts
    score += 1;
    reasons.push("No related contract was found in Guardian for this proposal.");
  }

  const age = daysSince(proposal.updated_at, now);
  if (age != null && age >= config.staleDays) {
    score += config.weights.staleUpdate;
    reasons.push(`No recent update in ${age} days (idle threshold ${config.staleDays}d).`);
  }

  const followUpAt = readFollowUpAt(proposal);
  if (followUpAt) {
    const followAge = daysSince(followUpAt, now);
    if (followAge != null && followAge >= 0) {
      score += config.weights.followUpPassed;
      reasons.push("Configured follow-up date has passed.");
    }
  }

  const lastView = daysSince(proposal.last_viewed_at ?? proposal.first_viewed_at, now);
  if (lastView == null || lastView >= config.staleDays) {
    score += config.weights.noRecentView;
    reasons.push("No recent client view activity was found.");
  }

  if (proposal.total_cents >= config.highValueCents) {
    score += config.weights.highValue;
    reasons.push(
      `Commercial value is ${formatMoney(proposal.total_cents, proposal.currency)}.`
    );
  }

  if (score < 3) return null;

  return {
    proposalId: proposal.id,
    title: proposal.title,
    clientName: args.clientName,
    amountLabel: formatMoney(proposal.total_cents, proposal.currency),
    status: proposal.status,
    score,
    reasons,
    recommendedAction: `Follow up with ${args.clientName} on "${proposal.title}".`,
  };
}

export function rankProposalFollowUps(
  proposals: Proposal[],
  args: {
    profileNames: Record<string, string>;
    now?: Date;
    config?: ProposalFollowUpConfig;
  }
): { candidates: ProposalFollowUpCandidate[]; claims: GideonClaim[] } {
  const candidates: ProposalFollowUpCandidate[] = [];
  for (const proposal of proposals) {
    const clientName =
      args.profileNames[proposal.client_profile_id]?.trim() || "Client";
    const scored = scoreProposalFollowUp(proposal, {
      clientName,
      now: args.now,
      config: args.config,
    });
    if (scored) candidates.push(scored);
  }
  candidates.sort((a, b) => b.score - a.score);

  const claims: GideonClaim[] = candidates.slice(0, 8).map((c) => ({
    claim: `${c.clientName} — ${c.title} needs follow-up (${c.reasons[0] ?? "stale open proposal"}).`,
    kind: "KNOWN_FACT",
    confidence: Math.min(0.95, 0.5 + c.score / 20),
    evidence: [
      {
        sourceId: c.proposalId,
        sourceType: "proposal",
        label: c.title,
        href: `/proposals/${c.proposalId}`,
        reference: c.reasons.join(" "),
      },
    ],
  }));

  return { candidates, claims };
}
