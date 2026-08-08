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

/** Queue background analysis — returns immediately after job creation. */
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
      processingStage?: DocumentProcessingStage;
      processingLabel?: string;
      jobId?: string | null;
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
