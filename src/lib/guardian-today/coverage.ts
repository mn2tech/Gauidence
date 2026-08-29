import type { GuardianTodayCoverage, GuardianIntelligencePipelineStatus } from "./types";

export type SourceStatusRow = {
  id: string;
  profile_id: string;
  guardian_items_status: string | null;
  analysis_status: string | null;
  updated_at?: string | null;
};

const ANALYZED = new Set(["completed", "needs_verification"]);
const PROCESSED = new Set(["completed", "skipped"]);
const IN_FLIGHT = new Set(["pending", "processing", "retryable"]);
const FAILED = new Set(["failed"]);

/**
 * Derive Guardian Today coverage from existing document processing columns.
 * Does not invent numbers — only counts accessible, analyzed sources.
 */
export function deriveCoverage(args: {
  spaceIds: string[];
  sources: SourceStatusRow[];
  activeItemCount: number;
  lastWatchEvaluationAt?: string | null;
}): GuardianTodayCoverage {
  const eligible = args.sources.filter((s) =>
    ANALYZED.has(s.analysis_status ?? "")
  );

  let processedSourceCount = 0;
  let pendingSourceCount = 0;
  let processingSourceCount = 0;
  let failedSourceCount = 0;
  let lastExtractionAt: string | null = null;

  for (const row of eligible) {
    const status = row.guardian_items_status ?? "pending";
    if (PROCESSED.has(status)) {
      processedSourceCount += 1;
      if (row.updated_at) {
        if (!lastExtractionAt || row.updated_at > lastExtractionAt) {
          lastExtractionAt = row.updated_at;
        }
      }
    } else if (status === "processing") {
      processingSourceCount += 1;
      pendingSourceCount += 1;
    } else if (IN_FLIGHT.has(status)) {
      pendingSourceCount += 1;
    } else if (FAILED.has(status)) {
      failedSourceCount += 1;
    } else {
      pendingSourceCount += 1;
    }
  }

  const sourceCount = eligible.length;
  const status = resolvePipelineStatus({
    spaceCount: args.spaceIds.length,
    sourceCount,
    processedSourceCount,
    pendingSourceCount,
    processingSourceCount,
    failedSourceCount,
  });

  return {
    spaceCount: args.spaceIds.length,
    sourceCount,
    processedSourceCount,
    pendingSourceCount,
    processingSourceCount,
    failedSourceCount,
    activeItemCount: args.activeItemCount,
    lastExtractionAt,
    lastWatchEvaluationAt: args.lastWatchEvaluationAt ?? null,
    status,
  };
}

export function resolvePipelineStatus(args: {
  spaceCount: number;
  sourceCount: number;
  processedSourceCount: number;
  pendingSourceCount: number;
  processingSourceCount: number;
  failedSourceCount: number;
}): GuardianIntelligencePipelineStatus {
  // Only "no sources" when the user has no Spaces at all.
  // Spaces with Daily Logs but zero analyzed docs are still "never scanned".
  if (args.spaceCount === 0) {
    return "no_sources";
  }

  if (args.sourceCount === 0) {
    return "never_scanned";
  }

  if (args.processedSourceCount === 0 && args.failedSourceCount === 0) {
    if (args.processingSourceCount > 0) return "processing";
    return "never_scanned";
  }

  if (args.pendingSourceCount > 0 || args.processingSourceCount > 0) {
    if (args.processedSourceCount > 0) return "partial";
    return "processing";
  }

  if (args.failedSourceCount > 0) {
    return args.processedSourceCount > 0 ? "partial" : "failed";
  }

  return "ready";
}

/**
 * Only claim "nothing needs attention" when evaluation truly finished.
 */
export function isTrulyCaughtUp(
  coverage: GuardianTodayCoverage,
  priorityCount: number
): boolean {
  return (
    coverage.status === "ready" &&
    priorityCount === 0 &&
    coverage.sourceCount > 0
  );
}

export function needsIntelligenceBackfill(
  coverage: GuardianTodayCoverage
): boolean {
  if (coverage.status === "no_sources") return false;
  return (
    coverage.pendingSourceCount > 0 ||
    coverage.failedSourceCount > 0 ||
    coverage.status === "never_scanned" ||
    coverage.status === "processing" ||
    coverage.status === "partial" ||
    coverage.status === "failed" ||
    // Spaces exist but Watch is empty — still sync Daily Logs / pending docs.
    (coverage.spaceCount > 0 && coverage.activeItemCount === 0)
  );
}

export function formatCoverageSummary(coverage: GuardianTodayCoverage): string {
  // Keep counts only — a wall-clock "Last checked 10:44 PM" confuses users
  // (sounds like a deadline or backfill status, not a scan timestamp).
  return [
    `Guardian checked ${coverage.spaceCount} Space${coverage.spaceCount === 1 ? "" : "s"}`,
    `${coverage.processedSourceCount} source${coverage.processedSourceCount === 1 ? "" : "s"} analyzed`,
  ].join(" · ");
}
