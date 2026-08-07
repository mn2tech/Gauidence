"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquare,
  XCircle,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import ProposalStatusBadge from "@/components/proposals/ProposalStatusBadge";
import ShareProposalButton from "@/components/proposals/ShareProposalButton";
import { clientBusinessLabel } from "@/lib/client-requests/helpers";
import { formatMoney } from "@/lib/proposals/pricing";
import { canShareProposal, type ProposalWithMeta } from "@/lib/proposals/types";
import { PROPOSALS_PATH } from "@/lib/routes";

const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const cardClass = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";
const buttonPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ProposalDetailBody({ proposal }: { proposal: ProposalWithMeta }) {
  return (
    <>
      {proposal.summary ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          {proposal.summary}
        </p>
      ) : null}
      {proposal.introduction ? (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
          {proposal.introduction}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Investment
        </p>
        <p className="mt-1 text-3xl font-bold text-brand">
          {formatMoney(proposal.total_cents, proposal.currency)}
        </p>
      </div>

      {proposal.line_items.length > 0 ? (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            What you&apos;re getting
          </h2>
          {proposal.line_items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-stone-200 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{item.title}</p>
                <p className="shrink-0 text-sm font-semibold">
                  {formatMoney(
                    Math.round(item.quantity * item.unitPriceCents),
                    proposal.currency
                  )}
                </p>
              </div>
              {item.description ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                  {item.description}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {proposal.deliverables.length > 0 ? (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Deliverables
          </h2>
          <ul className="space-y-2">
            {proposal.deliverables.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-stone-200 px-4 py-3"
              >
                <p className="font-medium">{item.title}</p>
                {item.description ? (
                  <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {proposal.timeline.length > 0 ? (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Timeline
          </h2>
          <ol className="space-y-2">
            {proposal.timeline.map((item, index) => (
              <li
                key={item.id}
                className="rounded-xl border border-stone-200 px-4 py-3"
              >
                <p className="font-medium">
                  {index + 1}. {item.title}
                </p>
                {item.description ? (
                  <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {proposal.addons.length > 0 ? (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Optional add-ons
          </h2>
          {proposal.addons.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-dashed border-stone-300 px-4 py-3"
            >
              <div>
                <p className="font-medium">{item.title}</p>
                {item.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <p className="text-sm font-semibold">
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
        <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Terms
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
            {proposal.terms}
          </p>
        </div>
      ) : null}
    </>
  );
}

export default function ClientProposalsScreen() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const { active, profiles } = useActiveProfile();
  const clientProfileId = active?.profile_type === "client" ? active.id : null;
  const businessLabel = clientBusinessLabel(profiles, active);

  const [proposals, setProposals] = useState<ProposalWithMeta[]>([]);
  const [detail, setDetail] = useState<ProposalWithMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const selected = useMemo(
    () => proposals.find((p) => p.id === selectedId) ?? detail,
    [proposals, selectedId, detail]
  );

  const loadList = useCallback(async () => {
    if (!clientProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/proposals?clientProfileId=${encodeURIComponent(clientProfileId)}`
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't load proposals.");
      setProposals(body.proposals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load proposals.");
    } finally {
      setLoading(false);
    }
  }, [clientProfileId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDone(null);
      setFeedback("");
      return;
    }

    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/proposals/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "view" }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load proposal.");
        if (!cancelled) {
          setDetail(body.proposal ?? null);
          setDone(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load proposal.");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const runAction = async (
    action: "accept" | "decline" | "request_changes"
  ) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          clientFeedback: action === "request_changes" ? feedback : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't update proposal.");
      const updated = body.proposal as ProposalWithMeta;
      setDetail(updated);
      setProposals((current) =>
        current.map((p) => (p.id === updated.id ? updated : p))
      );
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

  if (!clientProfileId) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-bold tracking-tight">Proposals</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Switch to a client vault to view proposals from your provider.
        </p>
      </div>
    );
  }

  if (selectedId && (detailLoading || selected)) {
    const proposal = selected;
    return (
      <div className="space-y-4">
        <Link
          href={PROPOSALS_PATH}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to proposals
        </Link>

        {detailLoading && !proposal ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : proposal ? (
          <div className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  {proposal.business_name ?? businessLabel ?? "Your provider"}
                </p>
                <h1 className="mt-1 text-2xl font-bold">{proposal.title}</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  Sent {formatWhen(proposal.sent_at ?? proposal.updated_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ProposalStatusBadge status={proposal.status} />
                {canShareProposal(proposal.status) ? (
                  <ShareProposalButton
                    proposalId={proposal.id}
                    proposalTitle={proposal.title}
                    clientName={proposal.client_name}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-stone-50"
                  />
                ) : null}
              </div>
            </div>

            <ProposalDetailBody proposal={proposal} />

            {done ? (
              <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {done === "accepted"
                  ? "Thank you — this proposal has been accepted."
                  : done === "declined"
                    ? "This proposal has been declined."
                    : "Your change request has been sent."}
              </p>
            ) : proposal.status !== "accepted" &&
              proposal.status !== "declined" ? (
              <div className="mt-8 space-y-3">
                <textarea
                  className={inputClass}
                  placeholder="Optional feedback or change requests"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction("accept")}
                    className={buttonPrimary}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Accept proposal
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction("request_changes")}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Request changes
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction("decline")}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Decline
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Proposals</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Review pricing, deliverables, and terms from{" "}
          {businessLabel ?? "your provider"}. Accept when you&apos;re ready to
          move forward.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : proposals.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <p className="text-sm text-ink-muted">
            No proposals yet. When {businessLabel ?? "your provider"} sends one,
            it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <Link
              key={proposal.id}
              href={`${PROPOSALS_PATH}?id=${proposal.id}`}
              className={`${cardClass} block transition hover:border-brand/40`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{proposal.title}</h3>
                    <ProposalStatusBadge status={proposal.status} />
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    {proposal.business_name ?? businessLabel} ·{" "}
                    {formatMoney(proposal.total_cents, proposal.currency)} ·{" "}
                    {formatWhen(proposal.sent_at ?? proposal.updated_at)}
                  </p>
                </div>
                <span className="text-xs font-semibold text-brand">View →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
