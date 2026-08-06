"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisStatus } from "@/lib/analysis/types";
import type { DocumentProcessingStage } from "@/lib/documents/processingStatus";

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
};

const POLL_INTERVAL_MS = 3000;

export function useDocumentProcessingPoll(
  documentIds: string[],
  options: { enabled?: boolean } = {}
) {
  const [statuses, setStatuses] = useState<
    Record<string, DocumentStatusSnapshot>
  >({});
  const activeIdsRef = useRef<Set<string>>(new Set());

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
    } satisfies DocumentStatusSnapshot;
  }, []);

  const pollOne = useCallback(
    async (documentId: string) => {
      const snapshot = await fetchStatus(documentId);
      if (!snapshot) return;
      setStatuses((prev) => ({ ...prev, [documentId]: snapshot }));
      if (snapshot.active) {
        activeIdsRef.current.add(documentId);
      } else {
        activeIdsRef.current.delete(documentId);
      }
    },
    [fetchStatus]
  );

  useEffect(() => {
    if (options.enabled === false) return;
    const ids = [...new Set(documentIds)].filter(Boolean);
    if (ids.length === 0) return;

    for (const id of ids) {
      void pollOne(id);
    }

    const timer = window.setInterval(() => {
      const active = [...activeIdsRef.current];
      if (active.length === 0) return;
      for (const id of active) {
        void pollOne(id);
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [documentIds.join(","), options.enabled, pollOne]);

  const markActive = useCallback((documentId: string) => {
    activeIdsRef.current.add(documentId);
    void pollOne(documentId);
  }, [pollOne]);

  return { statuses, markActive, refreshStatus: pollOne };
}
