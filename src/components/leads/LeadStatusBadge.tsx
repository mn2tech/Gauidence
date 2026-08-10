"use client";

import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads/types";

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-sky-100 text-sky-800",
  researched: "bg-violet-100 text-violet-800",
  contacted: "bg-amber-100 text-amber-800",
  follow_up: "bg-orange-100 text-orange-800",
  interested: "bg-emerald-100 text-emerald-800",
  proposal: "bg-brand-light text-brand-dark",
  won: "bg-green-100 text-green-800",
  lost: "bg-stone-100 text-stone-600",
};

export default function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}
