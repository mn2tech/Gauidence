"use client";

import Link from "next/link";
import { MessageCircle, RefreshCw } from "lucide-react";
import type {
  GuardianTodayCoverage,
  WhatChangedEntry,
} from "@/lib/guardian-today/types";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";

function CoverageLine({
  coverage,
  summary,
}: {
  coverage: GuardianTodayCoverage;
  summary: string | null;
}) {
  if (summary) {
    return <p className="mt-3 text-xs text-ink-muted">{summary}</p>;
  }
  if (coverage.status === "processing" || coverage.status === "partial") {
    return (
      <p className="mt-3 text-xs text-ink-muted">
        {coverage.processedSourceCount} of {coverage.sourceCount} items
        analyzed.
      </p>
    );
  }
  return null;
}

export function GuardianIntelligenceEmptyState({
  coverage,
  coverageSummary,
  onRetry,
  retrying,
  showRecentActivity,
  children,
}: {
  coverage: GuardianTodayCoverage;
  coverageSummary: string | null;
  onRetry?: () => void;
  retrying?: boolean;
  showRecentActivity?: boolean;
  children?: React.ReactNode;
}) {
  const status = coverage.status;

  if (status === "never_scanned") {
    return (
      <div className="simple-home-card p-4 sm:p-5">
        <p className="text-sm font-semibold text-foreground">
          Guardian is getting to know your Spaces.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Checking documents and Daily Logs for deadlines, events, and things
          that may need your attention.
        </p>
        <CoverageLine coverage={coverage} summary={coverageSummary} />
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand hover:text-brand-dark disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`}
              aria-hidden
            />
            Check now
          </button>
        ) : null}
        {showRecentActivity && children ? (
          <div className="mt-5 border-t border-border-subtle pt-4">
            {children}
          </div>
        ) : null}
      </div>
    );
  }

  if (status === "processing") {
    return (
      <div className="simple-home-card p-4 sm:p-5">
        <p className="text-sm font-semibold text-foreground">
          Guardian is checking your Spaces…
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Looking for deadlines, commitments, changes, and follow-ups across
          the Spaces you can access.
        </p>
        <CoverageLine coverage={coverage} summary={coverageSummary} />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="simple-home-card p-4 sm:p-5">
        <p className="text-sm font-semibold text-foreground">
          Guardian couldn&apos;t finish checking some of your information.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          {coverage.failedSourceCount} source
          {coverage.failedSourceCount === 1 ? "" : "s"} need another look.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`}
              aria-hidden
            />
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  if (status === "no_sources") {
    return (
      <div className="simple-home-card p-4 sm:p-5">
        <p className="text-sm font-semibold text-foreground">
          Guardian is ready when you are.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Add documents or notes to your Spaces and Guardian will watch for
          deadlines, commitments, and things that may need your attention.
        </p>
        <Link
          href={ASK_GIDEON_PATH}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Ask Gideon
        </Link>
      </div>
    );
  }

  if (status === "partial") {
    return (
      <div className="simple-home-card p-4 sm:p-5">
        <p className="text-sm font-semibold text-foreground">
          Guardian is still checking some of your information.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Priorities will appear here as soon as something needs your
          attention.
        </p>
        <CoverageLine coverage={coverage} summary={coverageSummary} />
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand hover:text-brand-dark disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`}
              aria-hidden
            />
            Continue checking
          </button>
        ) : null}
      </div>
    );
  }

  /* ready only — true empty after evaluation */
  return (
    <div className="simple-home-card p-4 sm:p-5">
      <p className="text-sm font-semibold text-foreground">
        Nothing needs your attention right now.
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Guardian checked your Spaces and found no urgent deadlines, unresolved
        commitments, important changes, or follow-ups.
      </p>
      <CoverageLine coverage={coverage} summary={coverageSummary} />
      <Link
        href={ASK_GIDEON_PATH}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        Ask Gideon
      </Link>
      {showRecentActivity && children ? (
        <div className="mt-5 border-t border-border-subtle pt-4">{children}</div>
      ) : null}
    </div>
  );
}

export function GuardianPartialBanner({
  coverage,
}: {
  coverage: GuardianTodayCoverage;
}) {
  if (coverage.status !== "partial") return null;
  return (
    <p className="mb-3 text-xs text-ink-muted">
      Guardian is still checking some of your information
      {coverage.sourceCount > 0
        ? ` (${coverage.processedSourceCount} of ${coverage.sourceCount} analyzed)`
        : ""}
      .
    </p>
  );
}

export function GuardianCoverageFooter({
  summary,
}: {
  summary: string | null;
}) {
  if (!summary) return null;
  return <p className="text-xs text-ink-muted">{summary}</p>;
}

/** @deprecated Use GuardianIntelligenceEmptyState */
export function GuardianCaughtUp({
  showRecentActivity,
  children,
}: {
  showRecentActivity?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <GuardianIntelligenceEmptyState
      coverage={{
        spaceCount: 1,
        sourceCount: 1,
        processedSourceCount: 1,
        pendingSourceCount: 0,
        processingSourceCount: 0,
        failedSourceCount: 0,
        activeItemCount: 0,
        lastExtractionAt: null,
        lastWatchEvaluationAt: null,
        status: "ready",
      }}
      coverageSummary={null}
      showRecentActivity={showRecentActivity}
    >
      {children}
    </GuardianIntelligenceEmptyState>
  );
}

export function GuardianWhatChanged({
  entries,
}: {
  entries: WhatChangedEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <section className="simple-home-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        What changed
      </h2>
      <ul className="mt-3 space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-start gap-2 text-sm text-ink-muted"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
            <span>
              {entry.label}
              {entry.spaceName ? (
                <span className="text-foreground/70"> · {entry.spaceName}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GuardianProvenancePanel({
  item,
  onClose,
}: {
  item: {
    title: string;
    provenanceMessage: string;
    sourceTitle: string | null;
    sourceExcerpt: string | null;
  } | null;
  onClose: () => void;
}) {
  if (!item) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Why am I seeing this?"
      onClick={onClose}
    >
      <div
        className="simple-home-card w-full max-w-md p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-foreground">
          Why am I seeing this?
        </h3>
        <p className="mt-2 text-sm text-ink-muted">{item.provenanceMessage}</p>
        {item.sourceTitle ? (
          <p className="mt-3 text-sm font-medium text-foreground">
            {item.sourceTitle}
          </p>
        ) : null}
        {item.sourceExcerpt ? (
          <blockquote className="mt-2 border-l-2 border-brand/40 pl-3 text-sm italic text-ink-muted">
            &ldquo;{item.sourceExcerpt}&rdquo;
          </blockquote>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-xs font-semibold text-brand hover:text-brand-dark"
        >
          Close
        </button>
      </div>
    </div>
  );
}
