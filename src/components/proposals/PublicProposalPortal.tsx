"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquare, XCircle } from "lucide-react";
import DownloadProposalButton from "@/components/proposals/DownloadProposalButton";
import ProposalStatusBadge from "@/components/proposals/ProposalStatusBadge";
import type { ProposalWithMeta } from "@/lib/proposals/types";
import { formatMoney } from "@/lib/proposals/pricing";

export default function PublicProposalPortal({ token }: { token: string }) {
  const [proposal, setProposal] = useState<ProposalWithMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/proposal-portal/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "view" }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load proposal.");
        if (!cancelled) setProposal(body.proposal ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load proposal.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const runAction = async (action: "accept" | "decline" | "request_changes") => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposal-portal/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:
            action === "accept"
              ? "accept"
              : action === "decline"
                ? "decline"
                : "request_changes",
          clientFeedback: action === "request_changes" ? feedback : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't update proposal.");
      setProposal(body.proposal ?? proposal);
      setDone(
        action === "accept"
          ? "accepted"
          : action === "decline"
            ? "declined"
            : "changes_requested"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update proposal.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-6 text-center text-rose-100">
        {error}
      </div>
    );
  }

  if (!proposal) return null;

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900 p-6 text-stone-100 shadow-2xl sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">
            {proposal.business_name ?? "Business"} proposal
          </p>
          <h1 className="mt-1 text-2xl font-bold">{proposal.title}</h1>
          <p className="mt-1 text-sm text-stone-400">
            Prepared for {proposal.client_name ?? "you"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProposalStatusBadge status={proposal.status} />
          <DownloadProposalButton
            portalToken={token}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-600 px-3 py-2 text-xs font-semibold text-stone-100 hover:bg-stone-800"
          />
        </div>
      </div>

      {proposal.summary ? (
        <p className="mt-6 text-sm leading-relaxed text-stone-300">{proposal.summary}</p>
      ) : null}
      {proposal.introduction ? (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-stone-300">
          {proposal.introduction}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-stone-800 bg-stone-950/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Investment
        </p>
        <p className="mt-1 text-3xl font-bold text-teal-300">
          {formatMoney(proposal.total_cents, proposal.currency)}
        </p>
      </div>

      {proposal.line_items.length > 0 ? (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            What you&apos;re getting
          </h2>
          {proposal.line_items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-stone-800 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{item.title}</p>
                <p className="shrink-0 text-sm font-semibold text-stone-200">
                  {formatMoney(
                    Math.round(item.quantity * item.unitPriceCents),
                    proposal.currency
                  )}
                </p>
              </div>
              {item.description ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-400">
                  {item.description}
                </p>
              ) : null}
              {item.quantity !== 1 || item.unitLabel !== "project" ? (
                <p className="mt-1 text-xs text-stone-500">
                  {item.quantity} × {formatMoney(item.unitPriceCents, proposal.currency)}{" "}
                  / {item.unitLabel}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {proposal.deliverables.length > 0 ? (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Deliverables
          </h2>
          <ul className="space-y-2">
            {proposal.deliverables.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-stone-800 px-4 py-3"
              >
                <p className="font-medium">{item.title}</p>
                {item.description ? (
                  <p className="mt-1 text-sm text-stone-400">{item.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {proposal.timeline.length > 0 ? (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Timeline
          </h2>
          <ol className="space-y-2">
            {proposal.timeline.map((item, index) => (
              <li
                key={item.id}
                className="rounded-xl border border-stone-800 px-4 py-3"
              >
                <p className="font-medium">
                  {index + 1}. {item.title}
                </p>
                {item.description ? (
                  <p className="mt-1 text-sm text-stone-400">{item.description}</p>
                ) : null}
                {item.startDate || item.endDate ? (
                  <p className="mt-1 text-xs text-stone-500">
                    {[item.startDate, item.endDate].filter(Boolean).join(" → ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {proposal.addons.length > 0 ? (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Optional add-ons
          </h2>
          {proposal.addons.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-dashed border-stone-700 px-4 py-3"
            >
              <div>
                <p className="font-medium">{item.title}</p>
                {item.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-400">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-stone-300">
                {formatMoney(
                  Math.round(item.quantity * item.unitPriceCents),
                  proposal.currency
                )}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {proposal.terms ? (
        <div className="mt-6 rounded-xl border border-stone-800 bg-stone-950/40 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Terms
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-400">
            {proposal.terms}
          </p>
        </div>
      ) : null}

      {done ? (
        <p className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {done === "accepted"
            ? "Thank you — this proposal is approved. If a deposit applies, watch for an invoice within 1 business day so we can schedule kickoff."
            : done === "declined"
              ? "This proposal has been declined."
              : "Your change request has been sent to the business."}
        </p>
      ) : proposal.status !== "accepted" && proposal.status !== "declined" ? (
        <div className="mt-8 space-y-3">
          <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 px-4 py-3">
            <h2 className="text-sm font-semibold text-teal-200">Next step</h2>
            <p className="mt-1 text-sm leading-relaxed text-stone-300">
              Review the terms above. When you&apos;re ready, click{" "}
              <strong className="font-semibold text-stone-100">
                Approve proposal
              </strong>{" "}
              below. If a deposit applies, you&apos;ll receive an invoice within 1
              business day to schedule kickoff.
            </p>
          </div>
          <textarea
            className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 placeholder:text-stone-500 focus:border-teal-500 focus:outline-none"
            placeholder="Optional feedback or change requests"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction("accept")}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Approve proposal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction("request_changes")}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-600 px-4 py-2.5 text-sm font-semibold hover:bg-stone-800 disabled:opacity-50"
            >
              <MessageSquare className="h-4 w-4" />
              Request changes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction("decline")}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-700/60 px-4 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-950/40 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Decline
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
