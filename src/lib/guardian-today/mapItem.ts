import type { GuardianItemType } from "@/lib/guardian-items/types";
import type { GuardianWatchItem } from "@/lib/guardian-items/types";
import type {
  GuardianIntelligenceItem,
  IntelligencePriority,
  IntelligenceSourceType,
  IntelligenceType,
  ScoredWatchItem,
} from "./types";
import { guardianPriorityToIntelligence } from "./scoring";

const TYPE_MAP: Record<GuardianItemType, IntelligenceType> = {
  deadline: "deadline",
  task: "task",
  commitment: "commitment",
  follow_up: "follow_up",
  reminder: "task",
  payment: "deadline",
  renewal: "deadline",
  expiration: "deadline",
  appointment: "important_fact",
  school_closure: "important_fact",
  return_window: "deadline",
  warranty: "deadline",
  birthday: "important_fact",
  travel: "important_fact",
  document_requirement: "task",
  event: "important_fact",
  informational: "important_fact",
};

export function mapGuardianTypeToIntelligence(
  type: GuardianItemType
): IntelligenceType {
  return TYPE_MAP[type] ?? "important_fact";
}

export function mapSourceType(raw: string): IntelligenceSourceType {
  switch (raw) {
    case "document":
      return "document";
    case "conversation":
      return "conversation";
    case "daily_log":
      return "daily_log";
    case "note":
      return "note";
    case "user":
    case "reminder":
      return "reminder";
    case "knowledge":
      return "knowledge";
    default:
      return "other";
  }
}

function buildSummary(item: GuardianWatchItem): string {
  if (item.description?.trim()) return item.description.trim();
  if (item.requires_action) return "This needs your attention.";
  if (item.effective_date) return "Coming up on your calendar.";
  return item.title;
}

function buildSuggestedAction(item: GuardianWatchItem): string | null {
  if (item.action_label?.trim()) return item.action_label.trim();
  if (item.requires_action) {
    switch (item.type) {
      case "follow_up":
        return "Follow up";
      case "deadline":
      case "expiration":
      case "renewal":
        return "Review before the deadline";
      case "commitment":
        return "Keep your commitment";
      default:
        return "Review";
    }
  }
  return null;
}

export function buildProvenanceMessage(args: {
  title: string;
  effectiveDate: string | null;
  sourceTitle: string | null;
  spaceName: string | null;
  type: IntelligenceType;
}): string {
  const space = args.spaceName ? ` inside your ${args.spaceName} Space` : "";
  if (args.sourceTitle) {
    if (args.effectiveDate) {
      return `Guardian found a ${formatDateLabel(args.effectiveDate)} ${args.type.replace("_", " ")} in "${args.sourceTitle}"${space}.`;
    }
    return `Guardian found this in "${args.sourceTitle}"${space}.`;
  }
  if (args.effectiveDate) {
    return `Guardian detected a ${args.type.replace("_", " ")} due ${formatDateLabel(args.effectiveDate)}${space}.`;
  }
  return `Guardian flagged "${args.title}"${space}.`;
}

function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function toIntelligenceItem(
  item: ScoredWatchItem,
  sourceTitle: string | null
): GuardianIntelligenceItem {
  const intelligenceType = mapGuardianTypeToIntelligence(item.type);
  const priority = guardianPriorityToIntelligence(item.resolvedPriority);

  return {
    id: item.id,
    userId: item.user_id,
    spaceId: item.space_id,
    spaceName: item.space_name,
    childName: item.child_name,
    sourceId: item.source_id,
    sourceType: mapSourceType(item.source_type),
    sourceDocumentId: item.source_document_id,
    sourceTitle,
    sourceExcerpt: item.source_excerpt,
    type: intelligenceType,
    title: item.title,
    summary: buildSummary(item),
    dueAt: item.due_at,
    effectiveDate: item.effective_date,
    status: "open",
    priority,
    score: item.score,
    confidence: item.confidence,
    reason: item.reason,
    suggestedAction: buildSuggestedAction(item),
    provenanceMessage: buildProvenanceMessage({
      title: item.title,
      effectiveDate: item.effective_date,
      sourceTitle,
      spaceName: item.space_name,
      type: intelligenceType,
    }),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}
