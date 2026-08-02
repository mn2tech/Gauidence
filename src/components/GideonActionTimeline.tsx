"use client";

import type { ActionEventPhase } from "@/lib/actions/types";

export type ActionTimelineItem = {
  id: string;
  actionId: string;
  label: string;
  phase: ActionEventPhase;
  message: string | null;
  createdAt: string;
};

function formatTimelineTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function phaseLabel(phase: ActionEventPhase): string {
  switch (phase) {
    case "detected":
      return "Started";
    case "proposed":
      return "Proposed";
    case "confirmed":
      return "Confirmed";
    case "executed":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return phase;
  }
}

type Props = {
  events: ActionTimelineItem[];
  className?: string;
};

export default function GideonActionTimeline({ events, className = "" }: Props) {
  if (events.length === 0) return null;

  return (
    <div
      className={`rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5 ${className}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        Today&apos;s activity
      </p>
      <ul className="mt-1.5 space-y-1">
        {events.slice(0, 8).map((event) => (
          <li
            key={event.id}
            className="flex items-start justify-between gap-2 text-xs text-foreground"
          >
            <span className="min-w-0">
              <span className="text-brand">✓</span>{" "}
              <span className="font-medium">{event.label}</span>
              {event.phase !== "executed" && event.phase !== "detected" ? (
                <span className="text-ink-muted"> · {phaseLabel(event.phase)}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-[10px] text-ink-muted">
              {formatTimelineTime(event.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
