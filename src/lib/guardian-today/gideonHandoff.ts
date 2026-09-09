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

/**
 * Ask Gideon opens on the extracted World topic (or source document) so Gideon
 * answers in that extract's context — not a generic unscoped chat.
 */
export function gideonHandoffHref(item: GuardianIntelligenceItem): string {
  const params = new URLSearchParams({
    draft: buildGideonHandoffDraft(item),
    profileId: item.spaceId,
  });
  if (item.worldEntityId) {
    params.set("worldEntityId", item.worldEntityId);
  } else if (item.sourceDocumentId) {
    params.set("documentId", item.sourceDocumentId);
  }
  return `${ASK_GIDEON_PATH}?${params.toString()}`;
}

export function reviewHref(item: GuardianIntelligenceItem): string {
  if (item.sourceDocumentId) {
    const params = new URLSearchParams({
      docs: "1",
      documentId: item.sourceDocumentId,
      profileId: item.spaceId,
    });
    return `/dashboard?${params.toString()}#documents-${item.spaceId}`;
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
