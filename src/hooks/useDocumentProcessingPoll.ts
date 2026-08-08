"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisStatus } from "@/lib/analysis/types";
import type { DocumentProcessingStage } from "@/lib/documents/processingStatus";
import type { OrganizationSuggestionPayload } from "@/lib/organization/types";

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
};

const POLL_INTERVAL_MS = 3000;

async function kickDocumentProcessingJobs(limit = 1): Promise<void> {
  try {
    await fetch("/api/documents/process-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    });
  } catch {
    // Best-effort — status polling will continue.
  }
}

export function useDocumentProcessingPoll(
  documentIds: string[],
  options: { enabled?: boolean; kickProcessing?: boolean } = {}
) {
  const [statuses, setStatuses] = useState<
    Record<string, DocumentStatusSnapshot>
  >({});
  const activeIdsRef = useRef<Set<string>>(new Set());
  const kickProcessing = options.kickProcessing ?? false;

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
    } satisfies DocumentStatusSnapshot;
  }, []);

  const pollOne = useCallback(
    async (documentId: string) => {
      if (kickProcessing) {
        void kickDocumentProcessingJobs(1);
      }
      const snapshot = await fetchStatus(documentId);
      if (!snapshot) return;
      setStatuses((prev) => ({ ...prev, [documentId]: snapshot }));
      if (snapshot.active) {
        activeIdsRef.current.add(documentId);
      } else {
        activeIdsRef.current.delete(documentId);
      }
    },
    [fetchStatus, kickProcessing]
  );

  useEffect(() => {
    if (options.enabled === false) return;
    const ids = [...new Set(documentIds)].filter(Boolean);
    if (ids.length === 0) return;

    for (const id of ids) {
      activeIdsRef.current.add(id);
      void pollOne(id);
    }

    const timer = window.setInterval(() => {
      for (const id of ids) {
        void pollOne(id);
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [documentIds.join(","), options.enabled, pollOne]);

  const markActive = useCallback(
    (documentId: string) => {
      activeIdsRef.current.add(documentId);
      void pollOne(documentId);
    },
    [pollOne]
  );

  return { statuses, markActive, refreshStatus: pollOne };
}
