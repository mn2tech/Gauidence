"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
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
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
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

  return (
    <li className="rounded-xl border border-border-subtle bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{item.summary}</p>
          {remaining ? (
            <p className="mt-1 text-xs font-medium text-foreground/80">
              {remaining}
            </p>
          ) : when ? (
            <p className="mt-1 text-xs text-ink-muted">{when}</p>
          ) : null}
          {item.spaceName ? (
            <p className="mt-1.5 text-xs font-medium text-brand">
              {item.spaceName}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Link
          href={reviewHref(item)}
          onClick={() => onReview(item)}
          className="text-xs font-semibold text-brand hover:text-brand-dark"
        >
          Review
        </Link>
        <Link
          href={gideonHandoffHref(item)}
          onClick={() => onAskGideon(item)}
          className="text-xs font-semibold text-brand hover:text-brand-dark"
        >
          Ask Gideon
        </Link>
        <button
          type="button"
          onClick={() => onComplete(item.id)}
          className="text-xs font-semibold text-ink-muted hover:text-foreground"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => onSnooze(item.id)}
          className="text-xs font-semibold text-ink-muted hover:text-foreground"
        >
          Remind me later
        </button>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="text-xs font-semibold text-ink-muted hover:text-foreground"
        >
          Dismiss
        </button>
        {item.sourceDocumentId ? (
          <button
            type="button"
            onClick={() => onViewSource(item)}
            className="text-xs font-semibold text-ink-muted hover:text-foreground"
          >
            View source
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onWhy(item)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-foreground"
        >
          <HelpCircle className="h-3 w-3" aria-hidden />
          Why am I seeing this?
        </button>
      </div>
    </li>
  );
}
