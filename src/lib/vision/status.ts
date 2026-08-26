import type { DocumentProcessingFields } from "@/lib/documents/processingStatus";
import {
  PROCESSING_STAGE_LABELS,
  PROCESSING_STEP_LABELS,
  deriveProcessingStage,
  userFacingStatusLabel,
} from "@/lib/documents/processingStatus";
import { isImageAsset } from "./routeAsset";

/** User-facing labels for image cards — no model/OCR names. */
export const VISION_STAGE_LABELS = {
  uploaded: "Uploaded",
  queued: "Waiting to analyze image…",
  analyzing: "Analyzing image...",
  ready: "Ready to ask Gideon",
  failed: "Analysis failed",
  retryable: "Analysis failed",
} as const;

export function visionStatusLabel(args: {
  mimeType?: string | null;
  fileName?: string | null;
  doc: DocumentProcessingFields;
}): string {
  const image = isImageAsset(args.mimeType ?? "", args.fileName ?? undefined);
  if (!image) return userFacingStatusLabel(args.doc);

  const stage = deriveProcessingStage(args.doc);
  if (stage === "analyzing" || stage === "queued") {
    return VISION_STAGE_LABELS.analyzing;
  }
  if (stage === "failed" || stage === "retryable") {
    return VISION_STAGE_LABELS.failed;
  }
  if (stage === "indexing" || stage === "knowledge_processing") {
    return PROCESSING_STAGE_LABELS[stage];
  }
  if (stage === "ready") return VISION_STAGE_LABELS.ready;

  const step = args.doc.processing_step;
  if (step === "queued") return VISION_STAGE_LABELS.queued;
  if (step && PROCESSING_STEP_LABELS[step]) {
    if (
      step === "extracting" ||
      step === "classifying" ||
      step === "analyzing" ||
      step === "validating"
    ) {
      return VISION_STAGE_LABELS.analyzing;
    }
  }
  if (stage === "uploaded") return VISION_STAGE_LABELS.uploaded;
  return userFacingStatusLabel(args.doc);
}
