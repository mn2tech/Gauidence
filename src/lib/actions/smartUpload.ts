import type { VaultUploadResult } from "@/lib/vault/clientUpload";
import type { OrganizationSuggestionPayload } from "@/lib/organization/types";

export const UPLOAD_THINKING_STEPS = [
  "Uploading file",
  "Reading document (OCR)",
  "Extracting entities",
  "Classifying document",
  "Suggesting space",
] as const;

export type SmartUploadPresentation = {
  fileName: string;
  documentId: string;
  title: string;
  documentType: string;
  confidence: number;
  showConfidence: boolean;
  workspaceLabel: string;
  vaultLabel: string | null;
  profilePath: string | null;
  suggestion: OrganizationSuggestionPayload | null;
  needsCreate: boolean;
};

function formatTypeLabel(type: string | null | undefined): string {
  if (!type) return "Document";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function confidenceFromResult(result: VaultUploadResult): number {
  if (result.organizationSuggestion?.confidence) {
    return result.organizationSuggestion.confidence;
  }
  if (result.classificationConfidence != null) {
    return result.classificationConfidence;
  }
  if (result.overallConfidence != null) {
    return result.overallConfidence;
  }
  return 0;
}

/** Build UI presentation for the smart upload card. */
export function buildSmartUploadPresentation(
  result: VaultUploadResult,
  currentProfileName: string
): SmartUploadPresentation | null {
  if (!result.analyzed) return null;

  const suggestion = result.organizationSuggestion;
  if (
    !suggestion ||
    suggestion.status !== "pending" ||
    result.organizationAutoApplied
  ) {
    return null;
  }

  const confidence = confidenceFromResult(result);
  const documentType =
    result.documentType ?? suggestion.tags?.[0] ?? "document";
  const title =
    result.title?.trim() ||
    suggestion.headline?.replace(/^Guardian recognized this as /i, "") ||
    result.fileName;

  const needsCreate =
    suggestion.recommendedAction === "create_profile_and_vault" ||
    suggestion.recommendedAction === "create_vault";

  return {
    fileName: result.fileName,
    documentId: result.documentId,
    title,
    documentType: formatTypeLabel(documentType),
    confidence,
    showConfidence: suggestion.showConfidence || confidence < 0.92,
    workspaceLabel: suggestion.profileName ?? currentProfileName,
    vaultLabel: suggestion.vaultName,
    profilePath: suggestion.profilePath,
    suggestion,
    needsCreate,
  };
}

/** Whether the user should confirm filing before Gideon continues. */
export function shouldPromptSmartUpload(
  result: VaultUploadResult,
  currentProfileId: string
): boolean {
  const presentation = buildSmartUploadPresentation(result, "");
  if (!presentation?.suggestion) return false;
  if (presentation.suggestion.status !== "pending") return false;
  if (result.organizationAutoApplied) return false;
  if (presentation.suggestion.recommendedAction === "keep_current") {
    return false;
  }
  const targetId =
    presentation.suggestion.suggestedVaultId ??
    presentation.suggestion.suggestedProfileId;
  if (targetId && targetId === currentProfileId) {
    return false;
  }
  return true;
}
