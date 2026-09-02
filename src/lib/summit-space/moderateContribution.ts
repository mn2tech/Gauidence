import {
  sanitizeContributionText,
  sanitizeContributionUrl,
} from "./contributions";

export type ContributionUpdateInput = {
  content?: string;
  publishedSummary?: string;
  sourceUrl?: string | null;
};

export function buildContributionUpdatePayload(
  input: ContributionUpdateInput
): Record<string, unknown> | null {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  let hasChange = false;

  if (input.content !== undefined) {
    updates.content = sanitizeContributionText(input.content);
    hasChange = true;
  }
  if (input.publishedSummary !== undefined) {
    const summary = sanitizeContributionText(input.publishedSummary);
    updates.published_summary = summary || null;
    hasChange = true;
  }
  if (input.sourceUrl !== undefined) {
    updates.source_url = sanitizeContributionUrl(input.sourceUrl);
    hasChange = true;
  }

  return hasChange ? updates : null;
}
