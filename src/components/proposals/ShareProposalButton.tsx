"use client";

import { useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";

type Props = {
  proposalId: string;
  proposalTitle: string;
  clientName?: string | null;
  className?: string;
  label?: string;
};

export default function ShareProposalButton({
  proposalId,
  proposalTitle,
  clientName,
  className = "inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-stone-50 disabled:opacity-50",
  label = "Share",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share" }),
      });
      const body = (await res.json()) as {
        error?: string;
        portalToken?: string;
      };
      if (!res.ok || !body.portalToken) {
        throw new Error(body.error ?? "Couldn't create share link.");
      }

      const url = `${window.location.origin}/proposal/${body.portalToken}`;
      const shareText = clientName
        ? `Proposal for ${clientName}: ${proposalTitle}`
        : proposalTitle;

      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: proposalTitle,
            text: shareText,
            url,
          });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't share proposal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void share()}
        className={className}
        title="Copy or share client portal link"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : label}
      </button>
      {error ? (
        <span className="text-[11px] text-rose-700">{error}</span>
      ) : null}
    </span>
  );
}
