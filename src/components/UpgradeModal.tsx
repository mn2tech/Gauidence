"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  PLAN_LABELS,
  PLAN_PRICE_DISPLAY,
  PRO_PLAN_ID,
  type PaidPlanId,
} from "@/lib/billing/plans";
import { trackFunnelEvent } from "@/lib/onboarding/events";

type Props = {
  open: boolean;
  onClose: () => void;
  reason?: string | null;
  /** Default checkout plan */
  plan?: PaidPlanId;
};

/**
 * Polished upgrade prompt shown after value — never holds Free data hostage.
 */
export default function UpgradeModal({
  open,
  onClose,
  reason,
  plan = PRO_PLAN_ID,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    trackFunnelEvent("upgrade_prompt_shown", {
      reason: reason ?? null,
      plan,
    });
  }, [open, reason, plan]);

  const startCheckout = useCallback(async () => {
    setBusy(true);
    setError(null);
    trackFunnelEvent("upgrade_clicked", { plan });
    trackFunnelEvent("checkout_started", { plan });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
      };
      if (!res.ok || !body.url) {
        setError(body.error ?? "Couldn't start checkout.");
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Couldn't start checkout. Check your connection.");
    } finally {
      setBusy(false);
    }
  }, [plan]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-muted hover:bg-stone-100 hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-gradient-to-br from-brand-light/80 via-white to-white px-6 pb-2 pt-8">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <h2
            id="upgrade-title"
            className="mt-4 text-xl font-bold tracking-tight text-foreground"
          >
            Your Guardian is starting to know your world.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Keep building your knowledge and let Guardian help you remember what
            matters, find information, surface commitments, and stay ahead of
            important follow-ups.
          </p>
          {reason ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
              {reason}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 px-6 py-5">
          <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              {PLAN_LABELS[plan]}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {PLAN_PRICE_DISPLAY[plan]} — cancel anytime. Your Free knowledge
              stays available.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void startCheckout()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Upgrade to {PLAN_LABELS[plan]}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full text-center text-sm font-medium text-ink-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Continue with Free
          </button>
          <p className="pt-1 text-center text-[11px] text-ink-muted">
            By upgrading you agree to our{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand hover:underline"
            >
              Terms of Use
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand hover:underline"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
