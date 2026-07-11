/**
 * Document input-mode selection (pure; safe for unit tests).
 * Visual structured docs → multimodal page images.
 * Long text-heavy PDFs → native text (hybrid when helpful).
 */

export type AnalysisInputMode = "visual" | "text" | "hybrid";

export type DocumentCharacteristics = {
  mimeType: string;
  pageCount: number | null;
  nativeTextQuality: number;
  hasNativeText: boolean;
  isImage: boolean;
  isPdf: boolean;
  /** Likely a short structured form/invoice/ID rather than a long contract. */
  likelyVisuallyStructured: boolean;
  /** Likely a long text-heavy document. */
  likelyTextHeavy: boolean;
};

export function detectDocumentCharacteristics(args: {
  mimeType: string;
  extraction: {
    quality: number;
    pageCount: number | null;
    charCount: number;
    text: string;
  };
}): DocumentCharacteristics {
  const isImage = args.mimeType.startsWith("image/");
  const isPdf = args.mimeType === "application/pdf";
  const pageCount = args.extraction.pageCount;
  const nativeTextQuality = args.extraction.quality;
  const hasNativeText = (args.extraction.text ?? "").trim().length >= 40;

  const likelyVisuallyStructured =
    isImage ||
    (isPdf && (pageCount == null || pageCount <= 4)) ||
    (isPdf && nativeTextQuality < 0.45);

  const likelyTextHeavy =
    isPdf &&
    pageCount != null &&
    pageCount >= 8 &&
    nativeTextQuality >= 0.5 &&
    hasNativeText;

  return {
    mimeType: args.mimeType,
    pageCount,
    nativeTextQuality,
    hasNativeText,
    isImage,
    isPdf,
    likelyVisuallyStructured,
    likelyTextHeavy,
  };
}

/**
 * Choose how content is sent to OpenAI chat.completions.
 * - visual: page images / original image (and PDF file only if images unavailable)
 * - text: native extracted text only
 * - hybrid: reliable text + limited page images for tables/forms
 */
export function resolveAnalysisInputMode(
  characteristics: DocumentCharacteristics
): AnalysisInputMode {
  if (characteristics.isImage) return "visual";
  if (characteristics.likelyTextHeavy) return "text";
  if (characteristics.likelyVisuallyStructured) return "visual";
  if (characteristics.hasNativeText && characteristics.nativeTextQuality >= 0.45) {
    return "hybrid";
  }
  return "visual";
}
