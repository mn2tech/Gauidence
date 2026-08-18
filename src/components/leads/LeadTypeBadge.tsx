"use client";

import { LEAD_TYPE_LABELS, type LeadType } from "@/lib/leads/types";

export default function LeadTypeBadge({ type }: { type?: LeadType | null }) {
  const resolved: LeadType = type === "federal_partner" ? "federal_partner" : "commercial";
  const cls =
    resolved === "federal_partner"
      ? "bg-slate-800 text-white"
      : "bg-teal-100 text-teal-900";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {LEAD_TYPE_LABELS[resolved]}
    </span>
  );
}
