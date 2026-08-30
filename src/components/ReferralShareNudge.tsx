"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Share2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  guardianReferralCode,
  guardianShareMessage,
} from "@/lib/share/guardian";

const DISMISS_KEY = "guardian_referral_nudge_dismissed_at";
const DISMISS_DAYS = 14;

function isDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

type Props = {
  /** Show after a meaningful win (e.g. add to calendar). */
  open: boolean;
  onClose: () => void;
};

/**
 * Soft post-win prompt to share the personal /try?ref= link.
 * Attribution already lands in signup_ref; no reward ledger yet.
 */
export default function ReferralShareNudge({ open, onClose }: Props) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [suppressed, setSuppressed] = useState(false);

  useEffect(() => {
    if (!open) {
      setShareUrl(null);
      setCopied(false);
      return;
    }
    if (isDismissedRecently()) {
      setSuppressed(true);
      return;
    }
    setSuppressed(false);

    const supabase = createClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id;
      if (!id || typeof window === "undefined") return;
      setShareUrl(
        `${window.location.origin}/try?ref=${guardianReferralCode(id)}`
      );
    });
  }, [open]);

  if (!open || suppressed || !shareUrl) return null;

  const inviteUrl = shareUrl;

  function dismiss() {
    markDismissed();
    setSuppressed(true);
    onClose();
  }

  async function share() {
    const text = guardianShareMessage(inviteUrl);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Try Guardian",
          text,
          url: inviteUrl,
        });
        markDismissed();
        onClose();
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="mt-2 rounded-lg border border-brand/20 bg-brand-light/40 px-3 py-2.5"
      role="status"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Know someone who&apos;d use this?
          </p>
          <p className="mt-0.5 text-xs text-stone-700">
            Share your invite link — when they subscribe, you earn a free month.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button
              type="button"
              onClick={() => void share()}
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-dark"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Share2 className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied ? "Link copied" : "Share invite"}
            </button>
            <Link
              href="/settings#referral"
              className="text-sm font-semibold text-stone-600 hover:text-foreground"
            >
              Get QR code
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-stone-500 hover:bg-white/80 hover:text-foreground"
          aria-label="Dismiss invite prompt"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
