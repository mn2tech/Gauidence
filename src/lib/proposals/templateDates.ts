/** Format a date ~30 days after assessment delivery for credit deadlines. */
export function assessmentCreditDeadline(
  analyzedAt: string | null | undefined,
  proposalDate = new Date()
): string {
  const base = analyzedAt ? new Date(analyzedAt) : proposalDate;
  const deadline = new Date(base);
  deadline.setUTCDate(deadline.getUTCDate() + 30);
  return deadline.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatProposalDate(date = new Date()): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
