"use client";

import Link from "next/link";
import { DOCUMENTS_PATH, PROPOSALS_PATH } from "@/lib/routes";
import type { BusinessLead } from "@/lib/leads/types";

export default function LeadDocumentsCard({ lead }: { lead: BusinessLead }) {
  const items: Array<{ label: string; href?: string }> = [];
  if (lead.source === "Business Card") {
    items.push({ label: "Business card (source)" });
  }
  if (lead.document_id) {
    items.push({
      label: "Linked document",
      href: `${DOCUMENTS_PATH}&id=${lead.document_id}`,
    });
  }
  if (lead.proposal_id) {
    items.push({
      label: "Related proposal",
      href: `${PROPOSALS_PATH}?id=${lead.proposal_id}`,
    });
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Documents</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          Capability statements, meeting notes, and proposals can be logged in
          Activity for now. Vault attachments come in a later phase.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.label}>
              {item.href ? (
                <Link href={item.href} className="text-brand hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className="text-ink-muted">{item.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
