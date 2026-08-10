"use client";

import Link from "next/link";
import type { BusinessLead } from "@/lib/leads/types";
import { leadDisplayName } from "@/lib/leads/types";
import { LEADS_PATH } from "@/lib/routes";
import LeadStatusBadge from "@/components/leads/LeadStatusBadge";

const REASON_LABELS: Record<string, string> = {
  email: "Same email",
  phone: "Same phone",
  website: "Same website",
  company_and_contact: "Same company and contact",
};

type DuplicateEntry = {
  lead: BusinessLead;
  reasons: string[];
};

type Props = {
  duplicates: DuplicateEntry[];
  onUseExisting: (leadId: string) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export default function LeadDuplicateDialog({
  duplicates,
  onUseExisting,
  onCreateAnyway,
  onCancel,
  busy = false,
}: Props) {
  const primary = duplicates[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Possible existing lead</h2>
        <p className="mt-2 text-sm text-ink-muted">
          This contact may already be in your leads list.
        </p>

        {primary ? (
          <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{leadDisplayName(primary.lead)}</p>
                {primary.lead.contact_name ? (
                  <p className="text-sm text-ink-muted">{primary.lead.contact_name}</p>
                ) : null}
                {primary.lead.email ? (
                  <p className="text-sm text-ink-muted">{primary.lead.email}</p>
                ) : null}
              </div>
              <LeadStatusBadge status={primary.lead.status} />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {primary.reasons
                .map((r) => REASON_LABELS[r] ?? r)
                .join(" · ")}
            </p>
            <Link
              href={`${LEADS_PATH}?id=${primary.lead.id}`}
              className="mt-2 text-sm font-medium text-brand hover:underline"
            >
              View existing lead
            </Link>
          </div>
        ) : null}

        {duplicates.length > 1 ? (
          <p className="mt-2 text-xs text-ink-muted">
            {duplicates.length - 1} more possible match
            {duplicates.length - 1 === 1 ? "" : "es"} found.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || !primary}
            onClick={() => primary && onUseExisting(primary.lead.id)}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            Use existing
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCreateAnyway}
            className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
          >
            Create anyway
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
