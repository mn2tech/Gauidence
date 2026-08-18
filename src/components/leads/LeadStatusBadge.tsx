"use client";

import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads/types";

const STATUS_COLORS: Partial<Record<LeadStatus, string>> = {
  new: "bg-sky-100 text-sky-800",
  identified: "bg-sky-100 text-sky-800",
  researched: "bg-violet-100 text-violet-800",
  research: "bg-violet-100 text-violet-800",
  ready_to_contact: "bg-indigo-100 text-indigo-800",
  contact_ready: "bg-indigo-100 text-indigo-800",
  qualified: "bg-indigo-100 text-indigo-800",
  contacted: "bg-amber-100 text-amber-800",
  replied: "bg-amber-100 text-amber-900",
  follow_up: "bg-orange-100 text-orange-800",
  interested: "bg-emerald-100 text-emerald-800",
  meeting: "bg-emerald-100 text-emerald-800",
  demo: "bg-teal-100 text-teal-800",
  capability_meeting: "bg-teal-100 text-teal-800",
  teaming_discussion: "bg-cyan-100 text-cyan-800",
  opportunity_identified: "bg-cyan-100 text-cyan-900",
  proposal: "bg-brand-light text-brand-dark",
  teaming_subcontract: "bg-brand-light text-brand-dark",
  won: "bg-green-100 text-green-800",
  active_partner: "bg-green-100 text-green-800",
  lost: "bg-stone-100 text-stone-600",
  dormant: "bg-stone-100 text-stone-600",
};

export default function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-stone-100 text-stone-700"}`}
    >
      {LEAD_STATUS_LABELS[status] ?? status}
    </span>
  );
}
