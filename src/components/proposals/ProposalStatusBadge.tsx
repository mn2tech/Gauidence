import type { ProposalStatus } from "@/lib/proposals/types";
import { PROPOSAL_STATUS_LABELS } from "@/lib/proposals/types";

const STATUS_STYLES: Record<ProposalStatus, string> = {
  draft: "bg-stone-100 text-stone-700",
  sent: "bg-sky-100 text-sky-800",
  viewed: "bg-indigo-100 text-indigo-800",
  changes_requested: "bg-amber-100 text-amber-900",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-rose-100 text-rose-800",
  expired: "bg-stone-200 text-stone-600",
};

export default function ProposalStatusBadge({
  status,
}: {
  status: ProposalStatus;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}
    >
      {PROPOSAL_STATUS_LABELS[status]}
    </span>
  );
}
