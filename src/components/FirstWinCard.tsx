"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Sparkles, X } from "lucide-react";
import type { FirstWinHighlight } from "@/lib/onboarding/sampleDocument";
import { firstWinHeadline } from "@/lib/onboarding/sampleDocument";
import { DOCUMENTS_PATH } from "@/lib/routes";

type Props = {
  fileName: string;
  summary?: string | null;
  highlights: FirstWinHighlight[];
  onAskAnother: () => void;
  onAddOwn: () => void;
  onDismiss: () => void;
};

export default function FirstWinCard({
  fileName,
  summary,
  highlights,
  onAskAnother,
  onAddOwn,
  onDismiss,
}: Props) {
  const headline = firstWinHeadline(highlights);
  const deadlineCount = highlights.filter((h) => h.date).length;
  const [copied, setCopied] = useState(false);

  const copyText = [
    headline,
    `From ${fileName}`,
    "",
    ...highlights.map((h) => `${h.label}: ${h.value}`),
    summary ? `\n${summary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(copyText.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const attentionHref =
    deadlineCount > 0 ? `${DOCUMENTS_PATH}` : DOCUMENTS_PATH;

  return (
    <div
      role="status"
      className="mx-auto mb-3 max-w-xl rounded-2xl border border-brand/30 bg-gradient-to-br from-brand-light/80 via-white to-white px-4 py-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{headline}</p>
          <p className="mt-0.5 text-xs text-ink-muted">From {fileName}</p>

          {deadlineCount > 0 ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
              {deadlineCount} date{deadlineCount === 1 ? "" : "s"} can show up under{" "}
              <Link
                href={attentionHref}
                className="font-semibold text-brand hover:text-brand-dark"
              >
                Attention
              </Link>{" "}
              on Documents — so you don&apos;t miss what matters.
            </p>
          ) : null}

          {highlights.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {highlights.map((h) => (
                <li
                  key={`${h.label}-${h.value}`}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-foreground">{h.label}: </span>
                  <span className="text-ink-muted">{h.value}</span>
                </li>
              ))}
            </ul>
          ) : summary ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{summary}</p>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">
              Ask Gideon a question — answers come from your private vault, not the
              open web.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAskAnother}
              className="inline-flex rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark"
            >
              Ask Gideon another question
            </button>
            <button
              type="button"
              onClick={onAddOwn}
              className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-stone-50"
            >
              Add your own document
            </button>
            <button
              type="button"
              onClick={() => void copySummary()}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-stone-50"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-brand" aria-hidden />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copy summary
                </>
              )}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1.5 text-ink-muted transition hover:bg-stone-100 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
