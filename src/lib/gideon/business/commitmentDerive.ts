import type { CommitmentStatus } from "./types";

/**
 * Derive commitment candidates from proposal deliverables.
 * Distinguishes PROPOSED vs AGREED — never promotes draft to committed.
 */
export function deriveCommitmentsFromProposal(args: {
  proposalId: string;
  title: string;
  status: string;
  deliverables: Array<{ title: string; description?: string }>;
}): Array<{
  description: string;
  status: CommitmentStatus;
  commitment_type: string;
  source_ref: string;
}> {
  const status: CommitmentStatus =
    args.status === "accepted"
      ? "AGREED"
      : args.status === "sent" ||
          args.status === "viewed" ||
          args.status === "draft" ||
          args.status === "changes_requested"
        ? "PROPOSED"
        : args.status === "declined" || args.status === "expired"
          ? "CANCELLED"
          : "UNKNOWN";

  const items = args.deliverables.length
    ? args.deliverables
    : [{ title: args.title, description: undefined }];

  return items.map((d) => ({
    description: d.description?.trim()
      ? `${d.title}: ${d.description.trim()}`
      : d.title,
    status,
    commitment_type: "proposal_deliverable",
    source_ref: args.proposalId,
  }));
}
