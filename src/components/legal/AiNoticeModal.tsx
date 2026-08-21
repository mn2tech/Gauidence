"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { LEGAL_PATHS } from "@/lib/legal/versions";
import { writeAiNoticeAcknowledged } from "@/lib/legal/aiNoticeAck";

/**
 * One-time (per version) acknowledgment before first Gideon use.
 * Does not lock existing users out of the rest of the app — only gates Ask Gideon paths when shown via parent.
 */
export default function AiNoticeModal({
  open,
  onAcknowledged,
}: {
  open: boolean;
  onAcknowledged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acknowledge = useCallback(async () => {
    setBusy(true);
    setError(null);
    // Persist locally first so we never re-prompt on the next Ask visit,
    // even if the DB migration hasn't been applied yet.
    writeAiNoticeAcknowledged();
    try {
      const res = await fetch("/api/account/legal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiNoticeAcknowledged: true }),
      });
      if (!res.ok && res.status !== 503) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // Still dismiss — local ack already saved. Surface non-fatal note only.
        console.warn("AI notice server save failed:", body.error);
      }
      onAcknowledged();
    } catch {
      onAcknowledged();
    } finally {
      setBusy(false);
    }
  }, [onAcknowledged]);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-notice-title"
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <h2
          id="ai-notice-title"
          className="mt-4 text-xl font-bold tracking-tight text-foreground"
        >
          Gideon uses AI
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          AI can make mistakes. Verify important information against your
          original documents and authoritative sources.
        </p>
        <p className="mt-3 text-xs text-ink-muted">
          Read the full{" "}
          <Link
            href={LEGAL_PATHS.aiDisclaimer}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand hover:text-brand-dark"
          >
            AI Disclaimer
          </Link>
          .
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void acknowledge()}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Continue
        </button>
      </div>
    </div>
  );
}
