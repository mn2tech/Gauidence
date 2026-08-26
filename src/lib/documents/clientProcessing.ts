"use client";

import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import type { OrganizationSuggestionPayload } from "@/lib/organization/types";
import type { Fact } from "@/lib/analysis/types";
import type { DocumentProcessingStage } from "@/lib/documents/processingStatus";

export type VaultUploadResult = {
  documentId: string;
  fileName: string;
  analyzed: boolean;
  queued?: boolean;
  processingStage?: DocumentProcessingStage;
  processingLabel?: string;
  analysisError?: string;
  organizationSuggestion?: OrganizationSuggestionPayload | null;
  organizationAutoApplied?: boolean;
  summary?: string | null;
  title?: string | null;
  facts?: Fact[];
  documentType?: string | null;
  classificationConfidence?: number | null;
  overallConfidence?: number | null;
};

export type ScheduleAnalysisResult = {
  queued: boolean;
  documentId: string;
  processingStage?: DocumentProcessingStage;
  processingLabel?: string;
  jobId?: string | null;
  error?: string;
};

/** Queue background analysis — returns immediately after job creation.
 * JSON / CSV / Trello files run synchronously in the analyze request instead.
 */
export async function scheduleDocumentAnalysis(
  documentId: string
): Promise<ScheduleAnalysisResult> {
  try {
    const res = await fetch("/api/documents/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        timeZone: GUARDIAN_TIME_ZONE,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      queued?: boolean;
      sync?: boolean;
      processingStage?: DocumentProcessingStage;
      processingLabel?: string;
      jobId?: string | null;
      analysisStatus?: string;
    };

    if (!res.ok) {
      return {
        queued: false,
        documentId,
        error:
          body.error ??
          "Analysis couldn't be scheduled. You can retry from Documents.",
      };
    }

    // Sync JSON path finished in this request — treat as successfully scheduled.
    if (body.sync) {
      // Index/knowledge stages may still be pending after sync analyze.
      void kickDocumentProcessingJobs(2);
      return {
        queued: true,
        documentId,
        processingStage: body.processingStage,
        processingLabel: body.processingLabel ?? "Ready to ask Gideon",
        jobId: body.jobId ?? null,
      };
    }

    // Analyze only enqueues — drain immediately so Vision/docs don't sit on
    // "Analyzing…" until cron (every 2 min) or another screen kicks the worker.
    if (body.queued ?? true) {
      void kickDocumentProcessingJobs(2);
    }

    return {
      queued: Boolean(body.queued ?? true),
      documentId,
      processingStage: body.processingStage,
      processingLabel: body.processingLabel,
      jobId: body.jobId ?? null,
    };
  } catch {
    return {
      queued: false,
      documentId,
      error:
        "Analysis couldn't be scheduled. The file is saved in your space — retry from Documents.",
    };
  }
}

/** Neutral staging space for Add Anything before Guardian suggests a destination. */
export async function resolveAddAnythingStagingProfileId(): Promise<string> {
  const res = await fetch("/api/organization/staging-profile");
  const body = (await res.json().catch(() => ({}))) as {
    profileId?: string;
    error?: string;
  };
  if (!res.ok || !body.profileId) {
    throw new Error(
      body.error ?? "Couldn't prepare a staging space for your upload."
    );
  }
  return body.profileId;
}

/** Drain pending analyze/index/knowledge jobs after the UI moves on. */
export async function kickDocumentProcessingJobs(limit = 3): Promise<void> {
  try {
    await fetch("/api/documents/process-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    });
  } catch {
    // Best-effort background drain.
  }
}
