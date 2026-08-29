/**
 * Shared commitment heuristics (no server-only) for Watch rules + ingest.
 */

/** Reject policy/permission text that is not a personal open action. */
export function isActionableCommitmentText(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 12 || t.length > 400) return false;

  if (
    /\b(permission granted|permission to|authorized to|allowed to|may exit|without adult|policy|handbook|waiver|consent form)\b/i.test(
      t
    )
  ) {
    return false;
  }

  return /\b(i will|i'll|we will|we'll|need to|have to|must|promise|promised|commit|committed|follow[- ]?up|follow up|remind|todo|to-do|assigned to|action item|owe|due to|send|call|email|schedule|complete|finish|deliver)\b/i.test(
    t
  );
}
