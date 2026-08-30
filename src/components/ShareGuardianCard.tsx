"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { Check, Copy, QrCode, Share2 } from "lucide-react";
import { guardianShareMessage } from "@/lib/share/guardian";
import type { ReferralStats } from "@/lib/share/referralConstants";

type Props = {
  shareUrl: string;
  stats?: ReferralStats | null;
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ShareGuardianCard({ shareUrl, stats }: Props) {
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const rewardLabel = stats
    ? formatUsd(stats.rewardCents)
    : "$9.99";
  const maxPerYear = stats?.maxPerYear ?? 3;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setShareNote(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareNote("Couldn't copy — select the link below.");
    }
  }

  async function shareLink() {
    setShareNote(null);
    const text = guardianShareMessage(shareUrl);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Try Guardian",
          text,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    await copyLink();
  }

  return (
    <section
      id="referral"
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <QrCode className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Invite a friend</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Share your personal link. When they subscribe, you get{" "}
            {rewardLabel} credited to your next bill (up to {maxPerYear}{" "}
            rewards per year).
          </p>
        </div>
      </div>

      {stats && stats.totalGranted > 0 ? (
        <p className="mt-4 rounded-xl bg-brand-light/50 px-3 py-2 text-sm font-medium text-foreground">
          You&apos;ve earned {formatUsd(stats.totalCreditCents)} in referral
          credit
          {stats.grantedThisYear > 0
            ? ` (${stats.grantedThisYear} of ${maxPerYear} this year)`
            : null}
          . It applies automatically on your next Stripe invoice.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
        >
          {copied ? (
            <Check className="h-4 w-4 text-brand" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={() => void shareLink()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          Share
        </button>
      </div>

      <p className="mt-3 break-all rounded-xl bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700">
        {shareUrl}
      </p>
      {shareNote ? (
        <p className="mt-2 text-xs font-medium text-rose-700">{shareNote}</p>
      ) : null}

      <div className="mt-6 flex flex-col items-center border-t border-stone-100 pt-6">
        <div
          className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
          aria-label={`QR code linking to ${shareUrl}`}
        >
          <QRCode
            value={shareUrl}
            size={200}
            level="M"
            bgColor="#ffffff"
            fgColor="#1c1917"
            title="Try Guardian signup link"
          />
        </div>
        <p className="mt-4 text-center text-sm font-medium text-foreground">
          Or scan to try Guardian
        </p>
        <p className="mt-1 max-w-xs text-center text-xs text-ink-muted">
          Point a phone camera at the code, or open the Camera app and tap the
          link that appears.
        </p>
      </div>
    </section>
  );
}
