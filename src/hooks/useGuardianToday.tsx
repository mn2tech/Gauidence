"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GuardianIntelligenceItem,
  GuardianTodayCoverage,
  GuardianTodayResult,
  WhatChangedEntry,
} from "@/lib/guardian-today/types";

const EMPTY_COVERAGE: GuardianTodayCoverage = {
  spaceCount: 0,
  sourceCount: 0,
  processedSourceCount: 0,
  pendingSourceCount: 0,
  processingSourceCount: 0,
  failedSourceCount: 0,
  activeItemCount: 0,
  lastExtractionAt: null,
  lastWatchEvaluationAt: null,
  status: "never_scanned",
};

const EMPTY: GuardianTodayResult = {
  priorities: [],
  whatChanged: [],
  caughtUp: false,
  coverage: EMPTY_COVERAGE,
  coverageSummary: null,
  backfillRecommended: false,
};

function normalizeToday(
  body: Partial<GuardianTodayResult> | null
): GuardianTodayResult {
  return {
    ...EMPTY,
    ...body,
    priorities: Array.isArray(body?.priorities) ? body!.priorities! : [],
    whatChanged: Array.isArray(body?.whatChanged) ? body!.whatChanged! : [],
    coverage: body?.coverage ?? EMPTY_COVERAGE,
    caughtUp: Boolean(body?.caughtUp),
    coverageSummary: body?.coverageSummary ?? null,
    backfillRecommended: Boolean(body?.backfillRecommended),
  };
}

export function useGuardianToday() {
  const [data, setData] = useState<GuardianTodayResult>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const backfillStarted = useRef(false);
  const mounted = useRef(true);
  const [provenanceOpen, setProvenanceOpen] =
    useState<GuardianIntelligenceItem | null>(null);
  const [sourceOpen, setSourceOpen] = useState<{
    itemId: string;
    title: string;
    documentTitle: string | null;
    excerpt: string | null;
    message: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/guardian/today");
      if (!res.ok) {
        if (mounted.current) setData(EMPTY);
        return EMPTY;
      }
      const body = (await res.json()) as Partial<GuardianTodayResult>;
      const next = normalizeToday(body);
      if (mounted.current) setData(next);
      return next;
    } catch {
      if (mounted.current) setData(EMPTY);
      return EMPTY;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  /** Queue only — cron / upload flows drain jobs. Never kick process-jobs from Home. */
  const runBackfill = useCallback(async () => {
    setRetrying(true);
    try {
      await fetch("/api/guardian/intelligence/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 8, drain: false }),
      });
      await refresh();
    } finally {
      if (mounted.current) setRetrying(false);
    }
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    void (async () => {
      const result = await refresh();
      if (cancelled || !result) return;

      const shouldBackfill =
        result.backfillRecommended &&
        !backfillStarted.current &&
        result.coverage.status !== "no_sources";

      if (!shouldBackfill) return;

      backfillStarted.current = true;
      // Queue docs + sync Daily Logs (includes existing Prayer Breakfast etc.).
      void fetch("/api/guardian/intelligence/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 8, drain: false }),
      }).then(() => {
        if (!cancelled) {
          // Second refresh after sync so new guardian_items appear.
          window.setTimeout(() => {
            if (!cancelled) void refresh();
          }, 1500);
        }
      });
    })();

    return () => {
      cancelled = true;
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordFeedback = useCallback(
    async (id: string, action: string) => {
      await fetch(`/api/guardian/items/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    },
    []
  );

  const complete = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/guardian/items/${id}/complete`, {
        method: "POST",
      });
      if (res.ok) await refresh();
    },
    [refresh]
  );

  const dismiss = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/guardian/items/${id}/dismiss`, {
        method: "POST",
      });
      if (res.ok) await refresh();
    },
    [refresh]
  );

  const snooze = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/guardian/items/${id}/snooze`, {
        method: "POST",
      });
      if (res.ok) await refresh();
    },
    [refresh]
  );

  const viewSource = useCallback(
    async (item: GuardianIntelligenceItem) => {
      void recordFeedback(item.id, "opened");
      const res = await fetch(`/api/guardian/items/${item.id}/source`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        title?: string;
        documentTitle?: string | null;
        excerpt?: string | null;
        message?: string;
      };
      setSourceOpen({
        itemId: item.id,
        title: body.title ?? item.title,
        documentTitle: body.documentTitle ?? item.sourceTitle,
        excerpt: body.excerpt ?? item.sourceExcerpt,
        message: body.message ?? item.provenanceMessage,
      });
    },
    [recordFeedback]
  );

  const askGideon = useCallback(
    (item: GuardianIntelligenceItem) => {
      void recordFeedback(item.id, "asked_gideon");
    },
    [recordFeedback]
  );

  const review = useCallback(
    (item: GuardianIntelligenceItem) => {
      void recordFeedback(item.id, "reviewed");
    },
    [recordFeedback]
  );

  return {
    data,
    loading,
    retrying,
    refresh,
    runBackfill,
    complete,
    dismiss,
    snooze,
    viewSource,
    askGideon,
    review,
    provenanceOpen,
    setProvenanceOpen,
    sourceOpen,
    closeSource: () => setSourceOpen(null),
  };
}

export type { GuardianIntelligenceItem, WhatChangedEntry };
