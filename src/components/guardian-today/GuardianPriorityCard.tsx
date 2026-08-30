"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, HelpCircle, MoreHorizontal } from "lucide-react";
import ReferralShareNudge from "@/components/ReferralShareNudge";
import type { GuardianIntelligenceItem } from "@/lib/guardian-today/types";
import {
  gideonHandoffHref,
  reviewHref,
} from "@/lib/guardian-today/gideonHandoff";

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-yellow-400",
  low: "bg-slate-300",
};

function formatWhen(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function daysRemaining(date: string | null, today?: string): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = Date.UTC(y, m - 1, d, 12);
  const now = today
    ? (() => {
        const [ty, tm, td] = today.split("-").map(Number);
        return Date.UTC(ty!, tm! - 1, td!, 12);
      })()
    : Date.now();
  const days = Math.round((target - now) / 86_400_000);
  if (days < 0)
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

export function GuardianPriorityCard({
  item,
  onComplete,
  onDismiss,
  onSnooze,
  onViewSource,
  onAskGideon,
  onReview,
  onWhy,
}: {
  item: GuardianIntelligenceItem;
  onComplete: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onViewSource: (item: GuardianIntelligenceItem) => void;
  onAskGideon: (item: GuardianIntelligenceItem) => void;
  onReview: (item: GuardianIntelligenceItem) => void;
  onWhy: (item: GuardianIntelligenceItem) => void;
}) {
  const dot = PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.medium;
  const when = formatWhen(item.effectiveDate);
  const remaining = daysRemaining(item.effectiveDate);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarNote, setCalendarNote] = useState<string | null>(null);
  const [showReferralNudge, setShowReferralNudge] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  async function addToPhoneCalendar() {
    if (!item.effectiveDate) return;
    setCalendarBusy(true);
    setCalendarNote(null);
    try {
      const res = await fetch(`/api/guardian/items/${item.id}/calendar`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        google_url?: string;
        ics?: string;
        filename?: string;
      };
      if (!res.ok) {
        setCalendarNote(body.error ?? "Calendar event unavailable.");
        return;
      }
      if (body.google_url) {
        window.open(body.google_url, "_blank", "noopener,noreferrer");
      }
      if (body.ics && body.filename) {
        const blob = new Blob([body.ics], {
          type: "text/calendar;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = body.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      setCalendarNote("Added — open the file or Google Calendar to save it.");
      setShowReferralNudge(true);
    } finally {
      setCalendarBusy(false);
    }
  }

  const navLinkClass =
    "text-sm font-semibold text-brand hover:text-brand-dark";

  return (
    <li className="rounded-xl border border-border-subtle bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-snug tracking-tight text-foreground">
            {item.title}
          </p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-stone-800">
            {item.summary}
          </p>
          {remaining ? (
            <p className="mt-2 text-sm font-semibold text-foreground">
              {remaining}
            </p>
          ) : when ? (
            <p className="mt-2 text-sm font-medium text-stone-700">{when}</p>
          ) : null}
          {item.spaceName ? (
            <p className="mt-1.5 text-sm font-semibold text-brand">
              {item.spaceName}
            </p>
          ) : null}
          {calendarNote ? (
            <p className="mt-1.5 text-xs font-medium text-brand">{calendarNote}</p>
          ) : null}
          <ReferralShareNudge
            open={showReferralNudge}
            onClose={() => setShowReferralNudge(false)}
          />
        </div>
      </div>

      {/* Resolve — Done is primary */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onComplete(item.id)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          Done
        </button>
        <button
          type="button"
          onClick={() => onSnooze(item.id)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          Snooze 1 day
        </button>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-muted hover:bg-stone-100 hover:text-foreground"
        >
          Dismiss
        </button>
      </div>

      {/* Navigate / explain */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <Link
          href={reviewHref(item)}
          onClick={() => onReview(item)}
          className={navLinkClass}
        >
          Review
        </Link>
        <Link
          href={gideonHandoffHref(item)}
          onClick={() => onAskGideon(item)}
          className={navLinkClass}
        >
          Ask Gideon
        </Link>
        {item.effectiveDate ? (
          <button
            type="button"
            disabled={calendarBusy}
            onClick={() => void addToPhoneCalendar()}
            className={`${navLinkClass} disabled:opacity-60`}
          >
            {calendarBusy ? "Adding…" : "Add to calendar"}
          </button>
        ) : null}
        <div ref={moreRef} className="relative">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-stone-600 hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
            More
          </button>
          {moreOpen ? (
            <div
              role="menu"
              className="absolute left-0 z-20 mt-1 min-w-[11rem] rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
            >
              {item.sourceDocumentId ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    onViewSource(item);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-stone-50"
                >
                  View source
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onWhy(item);
                }}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-stone-50"
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                Why this?
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
