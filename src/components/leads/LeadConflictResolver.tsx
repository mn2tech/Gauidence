"use client";

import type { FieldDecision, ResearchFieldConflict } from "@/lib/leads/research/types";

type Props = {
  conflicts: ResearchFieldConflict[];
  decisions: Record<string, FieldDecision>;
  onChange: (field: string, decision: FieldDecision) => void;
};

export default function LeadConflictResolver({
  conflicts,
  decisions,
  onChange,
}: Props) {
  if (conflicts.length === 0) return null;
  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold">Review before overwrite</p>
      <p className="text-xs text-ink-muted">
        This lead already has data. Choose what to keep for each difference.
      </p>
      {conflicts.map((conflict) => {
        const decision = decisions[conflict.field] ?? "keep";
        return (
          <div key={conflict.field} className="rounded-lg border border-amber-100 bg-white p-3">
            <p className="text-sm font-medium">{conflict.label}</p>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <p className="font-medium text-ink-muted">Existing</p>
                <p className="mt-1 whitespace-pre-wrap">{conflict.existing}</p>
              </div>
              <div>
                <p className="font-medium text-ink-muted">Research found</p>
                <p className="mt-1 whitespace-pre-wrap">{conflict.researched}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["keep", "Keep existing"],
                  ["researched", "Use researched"],
                  ...(conflict.mergeValue ? [["merge", "Merge"] as const] : []),
                ] as Array<[FieldDecision, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange(conflict.field, value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    decision === value
                      ? "bg-brand text-white"
                      : "border border-stone-300 bg-white hover:bg-stone-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
