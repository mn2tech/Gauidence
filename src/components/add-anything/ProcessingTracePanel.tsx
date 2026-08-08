"use client";

import {
  formatDurationMs,
  topTimingBreakdown,
  type ProcessingTrace,
  type ProcessingTraceStageStatus,
} from "@/lib/documents/processingTrace";

type Props = {
  trace: ProcessingTrace;
  compact?: boolean;
};

function stageStatusSymbol(status: ProcessingTraceStageStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "running":
      return "…";
    case "failed":
      return "!";
    case "skipped":
      return "–";
    default:
      return "○";
  }
}

export default function ProcessingTracePanel({ trace, compact = false }: Props) {
  const breakdown = topTimingBreakdown(trace.diagnostics, compact ? 3 : 5);
  const elapsed = formatDurationMs(trace.elapsedMs);

  return (
    <div className="w-full rounded-xl border border-border-subtle bg-stone-50/80 px-4 py-3 text-left">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">Processing trace</span>
        <span className="text-ink-muted">{elapsed} elapsed</span>
      </div>
      <ul className="mt-2 space-y-1.5 text-xs text-ink-muted">
        {trace.stages.map((stage) => (
          <li key={stage.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="mr-1.5 text-foreground">
                {stageStatusSymbol(stage.status)}
              </span>
              <span
                className={
                  stage.status === "running"
                    ? "font-medium text-foreground"
                    : ""
                }
              >
                {stage.label}
              </span>
              {stage.id === trace.slowestStageId && stage.status === "completed" ? (
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-700">
                  slowest
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums">
              {stage.status === "pending"
                ? "waiting"
                : stage.status === "skipped"
                  ? "skipped"
                  : formatDurationMs(stage.durationMs)}
            </span>
          </li>
        ))}
      </ul>
      {breakdown.length > 0 ? (
        <div className="mt-3 border-t border-border-subtle pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            Time breakdown
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
            {breakdown.map((item) => (
              <li key={item.key} className="flex justify-between gap-3">
                <span>{item.label}</span>
                <span className="tabular-nums">{formatDurationMs(item.ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
