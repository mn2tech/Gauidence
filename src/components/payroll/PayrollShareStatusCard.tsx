"use client";

import { Ban, Download, Eye, Mail, RefreshCw } from "lucide-react";
import type { PayrollShare } from "@/lib/payroll/types";

type Props = {
  share: PayrollShare;
  onRevoke: () => void;
  onResend: () => void;
  loading?: boolean;
};

export default function PayrollShareStatusCard({
  share,
  onRevoke,
  onResend,
  loading = false,
}: Props) {
  const expired = new Date(share.expires_at).getTime() < Date.now();
  const revoked = Boolean(share.revoked_at);

  return (
    <div className="rounded-2xl border border-violet-800/50 bg-violet-950/20 p-6">
      <h3 className="text-sm font-semibold text-violet-200">Shared with Payroll</h3>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-stone-500">Recipient</dt>
          <dd className="text-stone-200">
            {share.recipient_name ? `${share.recipient_name} · ` : ""}
            {share.recipient_email}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Shared</dt>
          <dd className="text-stone-200">
            {new Date(share.created_at).toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Expires</dt>
          <dd className={expired ? "text-red-400" : "text-stone-200"}>
            {new Date(share.expires_at).toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Opened</dt>
          <dd className="flex items-center gap-1 text-stone-200">
            <Eye className="h-3.5 w-3.5" />
            {share.opened_at ? new Date(share.opened_at).toLocaleString() : "Not yet"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Downloads</dt>
          <dd className="flex items-center gap-1 text-stone-200">
            <Download className="h-3.5 w-3.5" />
            {share.download_count}
          </dd>
        </div>
      </dl>

      {!revoked && !expired ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onResend}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-600 px-4 py-2.5 text-sm font-medium text-stone-200 hover:bg-stone-800 disabled:opacity-50"
          >
            <Mail className="h-4 w-4" />
            Resend Access Email
          </button>
          <button
            type="button"
            onClick={onRevoke}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-2.5 text-sm font-medium text-red-300 hover:bg-red-950/50 disabled:opacity-50"
          >
            <Ban className="h-4 w-4" />
            Revoke Access
          </button>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-red-400">
          <RefreshCw className="h-4 w-4" />
          {revoked ? "Access has been revoked." : "Access has expired."}
        </p>
      )}
    </div>
  );
}
