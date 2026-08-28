import type { GuardianIntelligenceItem } from "./types";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";
import { documentsHref } from "@/lib/routes";

export function buildGideonHandoffDraft(item: GuardianIntelligenceItem): string {
  const lines = [
    "Help me handle this:",
    "",
    item.title,
    item.summary,
  ];
  if (item.effectiveDate) {
    lines.push(`Due: ${formatDateLabel(item.effectiveDate)}`);
  }
  if (item.spaceName) {
    lines.push(`Space: ${item.spaceName}`);
  }
  if (item.sourceTitle) {
    lines.push(`Source: ${item.sourceTitle}`);
  }
  return lines.join("\n");
}

export function gideonHandoffHref(item: GuardianIntelligenceItem): string {
  const params = new URLSearchParams({
    draft: buildGideonHandoffDraft(item),
    profileId: item.spaceId,
  });
  return `${ASK_GIDEON_PATH}?${params.toString()}`;
}

export function reviewHref(item: GuardianIntelligenceItem): string {
  if (item.sourceDocumentId) {
    return `${documentsHref(item.spaceId)}?doc=${encodeURIComponent(item.sourceDocumentId)}`;
  }
  return documentsHref(item.spaceId);
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
