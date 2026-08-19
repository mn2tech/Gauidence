"use client";

import { Loader2 } from "lucide-react";

const STEPS = [
  "Researching {name}...",
  "Checking federal registration...",
  "Finding contract vehicles...",
  "Reviewing federal awards...",
  "Identifying agency relationships...",
  "Analyzing NM2TECH partner fit...",
];

export default function LeadResearchProgress({
  companyName,
  stepIndex,
}: {
  companyName: string;
  stepIndex: number;
}) {
  const name = companyName.trim() || "this company";
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-brand" />
        {STEPS[Math.min(stepIndex, STEPS.length - 1)].replace("{name}", name)}
      </div>
      <ul className="mt-3 space-y-1 text-xs text-ink-muted">
        {STEPS.map((step, i) => (
          <li key={step} className={i <= stepIndex ? "text-foreground" : ""}>
            {i < stepIndex ? "✓" : i === stepIndex ? "●" : "○"}{" "}
            {step.replace("{name}", name).replace("...", "")}
          </li>
        ))}
      </ul>
    </div>
  );
}
