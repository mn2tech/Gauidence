"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";

type Props = {
  profileId: string;
};

export default function EmployeeInvoicePanel({ profileId }: Props) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Receipt className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">Invoices</h2>
          <p className="text-xs text-ink-muted">Upload contractor invoices</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        Scan or upload invoices to your vault documents.
      </p>
      <Link
        href={`/dashboard?camera=1#documents-${profileId}`}
        className="mt-3 inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
      >
        Upload invoice
      </Link>
    </div>
  );
}
