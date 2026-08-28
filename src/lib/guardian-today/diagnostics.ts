import type { GuardianTodayCoverage } from "./types";

export type GuardianIntelligenceDiagnostic = {
  accessibleSpaces: number;
  sourcesDiscovered: number;
  sourcesProcessed: number;
  sourcesPending: number;
  sourcesFailed: number;
  guardianItemsGenerated: number;
  watchEngineEvaluated: number;
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  pipelineStatus: GuardianTodayCoverage["status"];
  lastSuccessfulEvaluation: string | null;
};

export function buildIntelligenceDiagnostic(args: {
  coverage: GuardianTodayCoverage;
  evaluatedItemCount: number;
  priorityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}): GuardianIntelligenceDiagnostic {
  return {
    accessibleSpaces: args.coverage.spaceCount,
    sourcesDiscovered: args.coverage.sourceCount,
    sourcesProcessed: args.coverage.processedSourceCount,
    sourcesPending: args.coverage.pendingSourceCount,
    sourcesFailed: args.coverage.failedSourceCount,
    guardianItemsGenerated: args.coverage.activeItemCount,
    watchEngineEvaluated: args.evaluatedItemCount,
    byPriority: args.priorityCounts,
    pipelineStatus: args.coverage.status,
    lastSuccessfulEvaluation:
      args.coverage.lastWatchEvaluationAt ??
      args.coverage.lastExtractionAt,
  };
}
