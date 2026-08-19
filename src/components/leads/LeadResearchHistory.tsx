"use client";

import type { LeadResearchHistoryItem } from "@/lib/leads/types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function LeadResearchHistory({
  runs,
}: {
  runs?: LeadResearchHistoryItem[] | null;
}) {
  if (!runs || runs.length === 0) return null;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Research history</h2>
      <ul className="mt-3 space-y-3">
        {runs.map((run) => {
          const summary = (run.summary ?? {}) as {
            populated?: number;
            verified?: number;
          };
          const refresh = run.mode === "refresh";
          return (
            <li key={run.id} className="text-sm">
              <p className="font-medium">{formatDate(run.created_at)}</p>
              <p className="text-ink-muted">
                {refresh ? "Federal opportunities refreshed" : "Company profile researched"}
              </p>
              {typeof summary.populated === "number" ? (
                <p className="text-ink-muted">
                  {summary.populated} fields populated
                  {typeof summary.verified === "number"
                    ? ` · ${summary.verified} verified`
                    : ""}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
