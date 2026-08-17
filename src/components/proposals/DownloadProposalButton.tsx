"use client";

import { Download } from "lucide-react";

type Props = {
  proposalId?: string;
  portalToken?: string;
  className?: string;
  iconClassName?: string;
  label?: string;
};

export default function DownloadProposalButton({
  proposalId,
  portalToken,
  className = "inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-stone-50",
  iconClassName = "h-3.5 w-3.5",
  label = "Download PDF",
}: Props) {
  const href = portalToken
    ? `/api/proposal-portal/${encodeURIComponent(portalToken)}/export`
    : `/api/proposals/${proposalId}/export`;

  return (
    <a href={href} download className={className} title="Download PDF">
      <Download className={iconClassName} />
      {label}
    </a>
  );
}
