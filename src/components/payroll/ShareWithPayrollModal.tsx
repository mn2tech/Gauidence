"use client";

import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import type { PayrollAccessType, PayrollExportFormat } from "@/lib/payroll/types";
import { PAYROLL_SHARE_EXPIRY_OPTIONS } from "@/lib/payroll/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onShare: (args: {
    recipientEmail: string;
    recipientName: string;
    accessType: PayrollAccessType;
    allowedFormats: PayrollExportFormat[];
    expiresAt: string;
    requireEmailVerification: boolean;
    optionalMessage: string;
    replaceExisting: boolean;
  }) => Promise<void>;
  requiresReplace?: boolean;
};

export default function ShareWithPayrollModal({
  open,
  onClose,
  onShare,
  requiresReplace = false,
}: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [accessType, setAccessType] = useState<PayrollAccessType>("view_and_download");
  const [formats, setFormats] = useState<PayrollExportFormat[]>(["csv", "excel", "pdf"]);
  const [expiry, setExpiry] = useState("7d");
  const [customDate, setCustomDate] = useState("");
  const [requireVerification, setRequireVerification] = useState(true);
  const [message, setMessage] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(requiresReplace);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function toggleFormat(f: PayrollExportFormat) {
    setFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  function computeExpiresAt(): string {
    if (expiry === "custom" && customDate) {
      return new Date(customDate).toISOString();
    }
    const opt = PAYROLL_SHARE_EXPIRY_OPTIONS.find((o) => o.id === expiry);
    const hours = opt?.hours ?? 24 * 7;
    const d = new Date();
    d.setTime(d.getTime() + hours * 60 * 60 * 1000);
    return d.toISOString();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Recipient email is required.");
      return;
    }
    if (formats.length === 0) {
      setError("Select at least one file format.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onShare({
        recipientEmail: email.trim(),
        recipientName: name.trim(),
        accessType,
        allowedFormats: formats,
        expiresAt: computeExpiresAt(),
        requireEmailVerification: requireVerification,
        optionalMessage: message.trim(),
        replaceExisting,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't share report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-700 bg-stone-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-stone-100">Share with Payroll</h2>
        <p className="mt-1 text-sm text-stone-400">
          Send a secure link to your payroll company. They will only see this approved report.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-400">Recipient email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-stone-600 bg-stone-800 px-3 py-2 text-stone-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-400">Recipient name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-600 bg-stone-800 px-3 py-2 text-stone-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-400">Access permission</label>
            <div className="mt-2 flex gap-4">
              {(["view_only", "view_and_download"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-stone-300">
                  <input
                    type="radio"
                    checked={accessType === t}
                    onChange={() => setAccessType(t)}
                    className="accent-emerald-500"
                  />
                  {t === "view_only" ? "View only" : "View and download"}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-400">File formats</label>
            <div className="mt-2 flex gap-4">
              {(["csv", "excel", "pdf"] as const).map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm text-stone-300">
                  <input
                    type="checkbox"
                    checked={formats.includes(f)}
                    onChange={() => toggleFormat(f)}
                    className="accent-emerald-500"
                  />
                  {f.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-400">Expiration</label>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-600 bg-stone-800 px-3 py-2 text-stone-100"
            >
              {PAYROLL_SHARE_EXPIRY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {expiry === "custom" ? (
              <input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-600 bg-stone-800 px-3 py-2 text-stone-100"
              />
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={requireVerification}
              onChange={(e) => setRequireVerification(e.target.checked)}
              className="accent-emerald-500"
            />
            Require email verification
          </label>

          {requiresReplace ? (
            <label className="flex items-center gap-2 text-sm text-amber-300">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="accent-amber-500"
              />
              Replace existing share
            </label>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-stone-400">Optional message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-stone-600 bg-stone-800 px-3 py-2 text-stone-100"
            />
          </div>

          {error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-stone-600 px-4 py-3 text-sm font-medium text-stone-300 hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Send Secure Access
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
