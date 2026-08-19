"use client";

import { useState } from "react";
import type { ResearchConfidence, ResearchFact } from "@/lib/leads/research/types";

const LABELS: Record<ResearchConfidence, string> = {
  verified: "Verified",
  high: "High confidence",
  medium: "Review",
  low: "Review",
  not_found: "Not found",
};

function badgeClass(confidence: ResearchConfidence): string {
  if (confidence === "verified") return "text-emerald-700";
  if (confidence === "high") return "text-sky-700";
  if (confidence === "medium" || confidence === "low") return "text-amber-700";
  return "text-stone-500";
}

function mark(confidence: ResearchConfidence): string {
  if (confidence === "verified") return "✓";
  if (confidence === "high") return "●";
  if (confidence === "medium" || confidence === "low") return "△";
  return "—";
}

export default function LeadFieldEvidence({
  fact,
}: {
  fact?: ResearchFact | null;
}) {
  const [open, setOpen] = useState(false);
  if (!fact) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
      <span className={`font-medium ${badgeClass(fact.confidence)}`}>
        {mark(fact.confidence)} {LABELS[fact.confidence]}
      </span>
      {fact.source || fact.sourceUrl ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-medium text-brand hover:underline"
        >
          View source
        </button>
      ) : null}
      {open ? (
        <p className="w-full text-ink-muted">
          {fact.source || "Source on file"}
          {fact.sourceType ? ` · ${fact.sourceType}` : ""}
          {fact.verifiedAt
            ? ` · ${new Date(fact.verifiedAt).toLocaleDateString()}`
            : ""}
          {fact.sourceUrl ? (
            <>
              {" "}
              <a
                href={fact.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                Open
              </a>
            </>
          ) : null}
          {fact.notes ? ` — ${fact.notes}` : null}
        </p>
      ) : null}
    </div>
  );
}
