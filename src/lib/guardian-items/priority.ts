import type { GuardianItemPriority, GuardianItemType } from "./types";

function daysUntil(effectiveDate: string, today: string): number | null {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = effectiveDate.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return null;
  const a = Date.UTC(y1, m1 - 1, d1, 12);
  const b = Date.UTC(y2, m2 - 1, d2, 12);
  return Math.round((b - a) / 86_400_000);
}

const PRIORITY_RANK: Record<GuardianItemPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

function maxPriority(
  a: GuardianItemPriority,
  b: GuardianItemPriority
): GuardianItemPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

/**
 * Deterministic priority. LLM priority is an input, not final authority.
 */
export function resolveItemPriority(args: {
  type: GuardianItemType;
  requiresAction: boolean;
  llmPriority?: GuardianItemPriority | null;
  effectiveDate: string | null;
  today: string;
}): GuardianItemPriority {
  let priority: GuardianItemPriority = args.llmPriority ?? "normal";
  const days =
    args.effectiveDate != null
      ? daysUntil(args.effectiveDate, args.today)
      : null;

  if (args.requiresAction && days !== null && days < 0) {
    return "urgent";
  }
  if (days === 0) {
    priority = maxPriority(priority, args.requiresAction ? "urgent" : "high");
  } else if (days !== null && days === 1) {
    priority = maxPriority(priority, "high");
    if (args.type === "school_closure") {
      priority = maxPriority(priority, "high");
    }
  } else if (days !== null && days <= 3 && args.requiresAction) {
    priority = maxPriority(priority, "high");
  } else if (days !== null && days <= 7 && args.requiresAction) {
    priority = maxPriority(priority, "normal");
  } else if (
    days !== null &&
    days <= 30 &&
    (args.type === "expiration" ||
      args.type === "renewal" ||
      args.type === "warranty" ||
      args.type === "return_window")
  ) {
    priority = maxPriority(priority, "normal");
  } else if (
    !args.requiresAction &&
    (args.type === "informational" || args.type === "event")
  ) {
    priority = maxPriority(priority, "low") === "low" ? "low" : priority;
    if (priority === "urgent" || priority === "high") {
      /* keep awareness high only when LLM/date rules elevated it */
    } else {
      priority = "low";
    }
  }

  return priority;
}
