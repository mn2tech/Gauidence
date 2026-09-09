/** Excerpt helpers that do not require the database. */

import { truncateExcerpt } from "@/lib/semantic/normalize";

export const WORLD_SOURCE_TYPES = [
  "document",
  "document_chunk",
  "note",
  "daily_log",
  "upload",
  "guardian_item",
  "connector",
  "email",
  "calendar",
  "manual",
  "space_item",
] as const;

export function requireEvidenceExcerpt(
  excerpt: string | null | undefined,
  fallback: string
): string {
  const primary = excerpt?.trim();
  if (primary) return truncateExcerpt(primary, 500);
  const fb = fallback.trim();
  if (!fb) {
    throw new Error("Evidence excerpt required for world provenance");
  }
  return truncateExcerpt(fb, 500);
}
