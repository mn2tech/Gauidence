import { daysBetween } from "@/lib/guardian-items/dates";
import { resolveItemPriority } from "@/lib/guardian-items/priority";
import type {
  GuardianItemPriority,
  GuardianItemType,
  GuardianWatchItem,
} from "@/lib/guardian-items/types";
import type { IntelligencePriority, ScoredWatchItem } from "./types";

const PRIORITY_SCORE: Record<GuardianItemPriority, number> = {
  low: 10,
  normal: 30,
  high: 60,
  urgent: 90,
};

const TYPE_SCORE: Partial<Record<GuardianItemType, number>> = {
  deadline: 25,
  expiration: 25,
  renewal: 20,
  follow_up: 20,
  commitment: 18,
  task: 15,
  payment: 15,
  document_requirement: 12,
};

export function guardianPriorityToIntelligence(
  priority: GuardianItemPriority
): IntelligencePriority {
  switch (priority) {
    case "urgent":
      return "critical";
    case "high":
      return "high";
    case "normal":
      return "medium";
    case "low":
    default:
      return "low";
  }
}

export function explainPriority(args: {
  type: GuardianItemType;
  requiresAction: boolean;
  resolvedPriority: GuardianItemPriority;
  effectiveDate: string | null;
  today: string;
  confidence: number | null;
}): string {
  const days =
    args.effectiveDate != null
      ? daysBetween(args.today, args.effectiveDate)
      : null;

  if (days !== null && days < 0 && args.requiresAction) {
    const overdue = Math.abs(days);
    return `High priority because this is ${overdue} day${overdue === 1 ? "" : "s"} overdue and still needs action.`;
  }
  if (days === 0) {
    return args.requiresAction
      ? "Critical priority because this is due today."
      : "High priority because this happens today.";
  }
  if (days === 1) {
    return "High priority because this is due tomorrow.";
  }
  if (days !== null && days <= 5 && args.requiresAction) {
    return `High priority because this is due in ${days} days.`;
  }
  if (days !== null && days <= 7 && args.requiresAction) {
    return `Medium priority because this is due in ${days} days.`;
  }
  if (args.type === "follow_up" && args.requiresAction) {
    return "Medium priority because a follow-up was promised but none has been recorded.";
  }
  if (
    args.type === "expiration" ||
    args.type === "renewal" ||
    args.type === "return_window"
  ) {
    return days !== null
      ? `Medium priority because this opportunity or window closes in ${days} days.`
      : "Medium priority because an expiration or renewal date was detected.";
  }
  if (args.resolvedPriority === "urgent") {
    return "Critical priority based on urgency and timing.";
  }
  if (args.resolvedPriority === "high") {
    return "High priority based on timing and action required.";
  }
  if (args.confidence != null && args.confidence >= 0.95) {
    return "Guardian is confident this matters based on your documents.";
  }
  return "Guardian surfaced this because it may need your attention.";
}

export function scoreWatchItem(args: {
  item: GuardianWatchItem;
  today: string;
  now: Date;
}): ScoredWatchItem {
  const { item, today, now } = args;
  const resolvedPriority = resolveItemPriority({
    type: item.type,
    requiresAction: item.requires_action,
    llmPriority: item.priority,
    effectiveDate: item.effective_date,
    today,
  });

  let score = PRIORITY_SCORE[resolvedPriority];
  score += TYPE_SCORE[item.type] ?? 5;

  const days =
    item.effective_date != null
      ? daysBetween(today, item.effective_date)
      : null;

  if (days !== null && days < 0 && item.requires_action) {
    score += 40 + Math.min(20, Math.abs(days) * 2);
  } else if (days === 0) {
    score += item.requires_action ? 35 : 20;
  } else if (days === 1) {
    score += 25;
  } else if (days !== null && days <= 3) {
    score += 15;
  } else if (days !== null && days <= 7) {
    score += 8;
  }

  if (item.requires_action) score += 10;

  if (item.confidence != null) {
    score += Math.round(item.confidence * 10);
  }

  const ageMs = now.getTime() - new Date(item.created_at).getTime();
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 2) score += 5;

  const reason = explainPriority({
    type: item.type,
    requiresAction: item.requires_action,
    resolvedPriority,
    effectiveDate: item.effective_date,
    today,
    confidence: item.confidence,
  });

  return {
    ...item,
    resolvedPriority,
    score,
    reason,
  };
}

export function rankPriorities(
  items: ScoredWatchItem[],
  limit = 5
): ScoredWatchItem[] {
  const seen = new Set<string>();
  const ranked = [...items]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = a.effective_date ?? "9999-99-99";
      const db = b.effective_date ?? "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.title.localeCompare(b.title);
    })
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

  return ranked.slice(0, Math.min(limit, 5));
}
