import "server-only";

import type { Proposal } from "./types";
import { formatMoney } from "./pricing";

export function formatProposalsForGideon(
  proposals: Proposal[],
  profileNames: Record<string, string>
): string {
  if (proposals.length === 0) {
    return "(no proposals in scope)";
  }
  return proposals
    .map((proposal) => {
      const client =
        profileNames[proposal.client_profile_id]?.trim() || "Client";
      const business =
        profileNames[proposal.business_profile_id]?.trim() || "Business";
      const value = formatMoney(proposal.total_cents, proposal.currency);
      return [
        `- proposal_id: ${proposal.id}`,
        `  client: ${client} (${proposal.client_profile_id})`,
        `  business: ${business}`,
        `  title: ${proposal.title}`,
        `  status: ${proposal.status}`,
        `  total: ${value}`,
        proposal.summary ? `  summary: ${proposal.summary}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function scoreProposalRelevance(
  proposal: Proposal,
  question: string
): number {
  const q = question.toLowerCase();
  let score = 0;
  if (proposal.title.toLowerCase().includes(q)) score += 4;
  if (proposal.summary?.toLowerCase().includes(q)) score += 3;
  if (proposal.status.toLowerCase().includes(q)) score += 2;
  if (/\bproposal|quote|estimate|pricing\b/i.test(q)) score += 1;
  if (proposal.status === "draft" && /\bdraft\b/i.test(q)) score += 2;
  if (proposal.status === "accepted" && /\baccepted|won\b/i.test(q)) score += 2;
  return score;
}
