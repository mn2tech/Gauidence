import type { ScanResultSummary, SourceItem } from "./types";

export type ExistingSourceItemRow = {
  externalId: string;
  name: string;
  mimeType?: string | null;
  sourceUri?: string | null;
  sizeBytes?: number | null;
  modifiedAt?: string | null;
  processingStatus: string;
};

function normalizeIso(value?: string | null): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : value;
}

function itemChanged(
  existing: ExistingSourceItemRow,
  next: SourceItem
): boolean {
  if (existing.name !== next.name) return true;
  if ((existing.mimeType ?? null) !== (next.mimeType ?? null)) return true;
  if ((existing.sourceUri ?? null) !== (next.sourceUri ?? null)) return true;
  if ((existing.sizeBytes ?? null) !== (next.sizeBytes ?? null)) return true;
  if (normalizeIso(existing.modifiedAt) !== normalizeIso(next.modifiedAt ?? null)) {
    return true;
  }
  if (existing.processingStatus === "unavailable") return true;
  return false;
}

/**
 * Idempotent scan reconciliation against existing rows.
 * Missing files become unavailable; new/changed files are upserted.
 * Preserves analyzed / analyzing / analysis_failed when metadata is unchanged.
 */
export function reconcileScan(
  existing: ExistingSourceItemRow[],
  scanned: SourceItem[]
): {
  toUpsert: SourceItem[];
  toMarkUnavailable: string[];
  summary: ScanResultSummary;
} {
  const byExternal = new Map(existing.map((row) => [row.externalId, row]));
  const seen = new Set<string>();
  const toUpsert: SourceItem[] = [];
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const item of scanned) {
    seen.add(item.externalId);
    const prev = byExternal.get(item.externalId);
    if (!prev) {
      newCount += 1;
      toUpsert.push({ ...item, processingStatus: "discovered" });
      continue;
    }
    if (itemChanged(prev, item)) {
      updatedCount += 1;
      // Content/metadata changed — reset so Analyze can run again.
      toUpsert.push({ ...item, processingStatus: "discovered" });
    } else {
      unchangedCount += 1;
    }
  }

  const toMarkUnavailable: string[] = [];
  for (const row of existing) {
    if (seen.has(row.externalId)) continue;
    if (row.processingStatus === "unavailable") continue;
    toMarkUnavailable.push(row.externalId);
  }

  return {
    toUpsert,
    toMarkUnavailable,
    summary: {
      discovered: scanned.length,
      newCount,
      updatedCount,
      unavailableCount: toMarkUnavailable.length,
      unchangedCount,
    },
  };
}
