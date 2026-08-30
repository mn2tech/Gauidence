"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
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

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <Link
          href={reviewHref(item)}
          onClick={() => onReview(item)}
          className="text-sm font-semibold text-brand hover:text-brand-dark"
        >
          Review
        </Link>
        <Link
          href={gideonHandoffHref(item)}
          onClick={() => onAskGideon(item)}
          className="text-sm font-semibold text-brand hover:text-brand-dark"
        >
          Ask Gideon
        </Link>
        {item.effectiveDate ? (
          <button
            type="button"
            disabled={calendarBusy}
            onClick={() => void addToPhoneCalendar()}
            className="text-sm font-semibold text-brand hover:text-brand-dark disabled:opacity-60"
          >
            {calendarBusy ? "Adding…" : "Add to calendar"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onComplete(item.id)}
          className="text-sm font-semibold text-stone-600 hover:text-foreground"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => onSnooze(item.id)}
          className="text-sm font-semibold text-stone-600 hover:text-foreground"
        >
          Remind me later
        </button>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="text-sm font-semibold text-stone-600 hover:text-foreground"
        >
          Dismiss
        </button>
        {item.sourceDocumentId ? (
          <button
            type="button"
            onClick={() => onViewSource(item)}
            className="text-sm font-semibold text-stone-600 hover:text-foreground"
          >
            View source
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onWhy(item)}
          className="inline-flex items-center gap-1 text-sm font-semibold text-stone-600 hover:text-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          Why am I seeing this?
        </button>
      </div>
    </li>
  );
}
