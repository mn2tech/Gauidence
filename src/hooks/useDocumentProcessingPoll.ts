"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisStatus } from "@/lib/analysis/types";
import type { DocumentProcessingStage } from "@/lib/documents/processingStatus";
import type { OrganizationSuggestionPayload } from "@/lib/organization/types";
import type { ProcessingTrace } from "@/lib/documents/processingTrace";
import { kickDocumentProcessingJobs as kickJobs } from "@/lib/documents/clientProcessing";

export type DocumentStatusSnapshot = {
  documentId: string;
  analysisStatus: AnalysisStatus | string;
  indexingStatus?: string;
  knowledgeStatus?: string;
  processingStage: DocumentProcessingStage;
  processingLabel: string;
  processingProgress: number;
  searchable: boolean;
  active: boolean;
  lastError?: string | null;
  summary?: string | null;
  facts?: unknown;
  title?: string | null;
  documentType?: string | null;
  model?: string | null;
  organizationSuggestion?: OrganizationSuggestionPayload | null;
  processingTrace?: ProcessingTrace | null;
};

const POLL_INTERVAL_MS = 2500;
const DEFAULT_KICK_LIMIT = 2;
/** Never hammer status for every file in a large Space. */
const MAX_POLL_PER_TICK = 6;

async function kickDocumentProcessingJobs(limit = DEFAULT_KICK_LIMIT): Promise<void> {
  return kickJobs(limit);
}

export function useDocumentProcessingPoll(
  documentIds: string[],
  options: {
    enabled?: boolean;
    kickProcessing?: boolean;
    kickLimit?: number;
  } = {}
) {
  const [statuses, setStatuses] = useState<
    Record<string, DocumentStatusSnapshot>
  >({});
  const activeIdsRef = useRef<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const kickProcessing = options.kickProcessing ?? false;
  const kickLimit = options.kickLimit ?? DEFAULT_KICK_LIMIT;
  const kickInFlight = useRef(false);

  const fetchStatus = useCallback(async (documentId: string) => {
    const res = await fetch(`/api/documents/${documentId}/status`);
    if (!res.ok) return null;
    const body = (await res.json()) as DocumentStatusSnapshot & {
      analysisStatus: string;
    };
    return {
      documentId: body.documentId,
      analysisStatus: body.analysisStatus as AnalysisStatus,
      indexingStatus: body.indexingStatus,
      knowledgeStatus: body.knowledgeStatus,
      processingStage: body.processingStage,
      processingLabel: body.processingLabel,
      processingProgress: body.processingProgress,
      searchable: body.searchable,
      active: body.active,
      lastError: body.lastError,
      summary: body.summary,
      facts: body.facts,
      title: body.title,
      documentType: body.documentType,
      model: body.model,
      organizationSuggestion: body.organizationSuggestion ?? null,
      processingTrace: body.processingTrace ?? null,
    } satisfies DocumentStatusSnapshot;
  }, []);

  const pollOne = useCallback(
    async (documentId: string) => {
      if (kickProcessing && !kickInFlight.current) {
        kickInFlight.current = true;
        void kickDocumentProcessingJobs(kickLimit).finally(() => {
          kickInFlight.current = false;
        });
      }
      const snapshot = await fetchStatus(documentId);
      if (!snapshot) return;
      knownIdsRef.current.add(documentId);
      setStatuses((prev) => ({ ...prev, [documentId]: snapshot }));
      if (snapshot.active) {
        activeIdsRef.current.add(documentId);
      } else {
        activeIdsRef.current.delete(documentId);
      }
    },
    [fetchStatus, kickProcessing, kickLimit]
  );

  useEffect(() => {
    if (options.enabled === false) return;
    const ids = [...new Set(documentIds)].filter(Boolean);
    if (ids.length === 0) return;

    // First pass: only poll ids we have not settled yet + still-active ones.
    const initial = ids
      .filter(
        (id) =>
          activeIdsRef.current.has(id) || !knownIdsRef.current.has(id)
      )
      .slice(0, MAX_POLL_PER_TICK);

    for (const id of initial) {
      activeIdsRef.current.add(id);
      void pollOne(id);
    }

    const timer = window.setInterval(() => {
      const active = [...activeIdsRef.current].filter((id) =>
        ids.includes(id)
      );
      const unchecked = ids.filter(
        (id) =>
          !knownIdsRef.current.has(id) && !activeIdsRef.current.has(id)
      );
      const batch = [...active, ...unchecked].slice(0, MAX_POLL_PER_TICK);
      for (const id of batch) {
        void pollOne(id);
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [documentIds.join(","), options.enabled, pollOne]);

  const markActive = useCallback(
    (documentId: string) => {
      activeIdsRef.current.add(documentId);
      knownIdsRef.current.delete(documentId);
      void pollOne(documentId);
    },
    [pollOne]
  );

  return { statuses, markActive, refreshStatus: pollOne };
}
