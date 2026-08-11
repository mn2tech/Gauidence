"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Eye,
  Link2,
  Loader2,
  Shield,
  XCircle,
} from "lucide-react";
import type { IntakeRequestSummary } from "@/lib/intake/types";

type Props = {
  businessProfileId: string;
  employeeProfileId: string;
  employeeName: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function statusLabel(status: IntakeRequestSummary["status"]): string {
  switch (status) {
    case "pending":
      return "Sent";
    case "opened":
      return "Opened";
    case "submitted":
      return "Submitted";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    default:
      return status;
  }
}

function statusClass(status: IntakeRequestSummary["status"]): string {
  switch (status) {
    case "submitted":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "opened":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "expired":
    case "revoked":
      return "bg-stone-100 text-stone-600 ring-stone-200";
    default:
      return "bg-blue-50 text-blue-800 ring-blue-200";
  }
}

export default function ContractorIntakePanel({
  businessProfileId,
  employeeProfileId,
  employeeName,
  open: openProp,
  onOpenChange,
}: Props) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (value: boolean) => {
    if (onOpenChange) onOpenChange(value);
    else setOpenInternal(value);
  };
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<IntakeRequestSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealedSsn, setRevealedSsn] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/intake/requests?employeeProfileId=${encodeURIComponent(employeeProfileId)}&profileId=${encodeURIComponent(businessProfileId)}`
      );
      const body = await res.json();
      if (res.ok) setRequests(body.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [employeeProfileId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const sendRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(
        `/api/intake/requests?profileId=${encodeURIComponent(businessProfileId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeProfileId,
            recipientEmail: email.trim(),
            recipientName: employeeName,
            purpose: "ssn_clearance",
            optionalMessage: message.trim() || undefined,
            sendEmail: true,
          }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't send request.");
        return;
      }
      setRequests(body.requests ?? []);
      setLastUrl(body.intakeUrl ?? null);
      setEmail("");
      setMessage("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy link.");
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/intake/requests/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Couldn't revoke link.");
      return;
    }
    await loadRequests();
  };

  const revealSsn = async (id: string) => {
    setRevealingId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/intake/requests/${encodeURIComponent(id)}/reveal`
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't reveal SSN.");
        return;
      }
      setRevealedSsn((prev) => ({ ...prev, [id]: body.ssn }));
    } finally {
      setRevealingId(null);
    }
  };

  const hasVisibleContent = open || requests.length > 0 || lastUrl;
  if (onOpenChange && !hasVisibleContent) {
    return null;
  }

  return (
    <div className="mt-3 w-full rounded-xl border border-stone-200 bg-stone-50/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
          <Shield className="h-3.5 w-3.5 text-brand" />
          SSN / clearance intake
        </div>
        {!open && !onOpenChange ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-stone-50"
          >
            <Link2 className="h-3 w-3" />
            Request info
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>
      ) : null}

      {lastUrl ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-stone-200">
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
            {lastUrl}
          </span>
          <button
            type="button"
            onClick={() => void copyUrl(lastUrl)}
            className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-50"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}

      {open ? (
        <form onSubmit={sendRequest} className="mt-3 space-y-2">
          <label className="block text-xs">
            <span className="font-medium text-foreground">Contractor email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contractor@example.com"
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            />
          </label>
          <label className="block text-xs">
            <span className="text-ink-muted">Note (optional)</span>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="For clearance verification with HR"
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Send secure link
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-full px-2 py-1.5 text-xs text-ink-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="mt-2 text-xs text-ink-muted">Loading requests…</p>
      ) : requests.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {requests.map((r) => (
            <li
              key={r.id}
              className="rounded-lg bg-white px-3 py-2 ring-1 ring-stone-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{r.recipientEmail}</p>
                  <p className="text-[11px] text-ink-muted">
                    {new Date(r.createdAt).toLocaleDateString()}
                    {r.submittedAt
                      ? ` · submitted ${new Date(r.submittedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${statusClass(r.status)}`}
                >
                  {statusLabel(r.status)}
                </span>
              </div>
              {r.status === "submitted" ? (
                <div className="mt-2 space-y-1 text-xs text-ink-muted">
                  {r.ssnMasked ? (
                    <p>
                      SSN:{" "}
                      <span className="font-mono text-foreground">
                        {revealedSsn[r.id] ?? r.ssnMasked}
                      </span>
                      {!revealedSsn[r.id] && r.submissionType !== "document_upload" ? (
                        <button
                          type="button"
                          onClick={() => void revealSsn(r.id)}
                          disabled={revealingId === r.id}
                          className="ml-2 inline-flex items-center gap-0.5 text-brand hover:underline"
                        >
                          {revealingId === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          Reveal
                        </button>
                      ) : null}
                    </p>
                  ) : null}
                  {r.documentName ? (
                    <p>Document: {r.documentName}</p>
                  ) : null}
                </div>
              ) : r.status === "pending" || r.status === "opened" ? (
                <button
                  type="button"
                  onClick={() => void revoke(r.id)}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-red-700"
                >
                  <XCircle className="h-3 w-3" />
                  Revoke link
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          No intake requests yet. Send a link for the contractor to type or upload their SSN.
        </p>
      )}
    </div>
  );
}
