import "server-only";

import { extractText, getDocumentProxy } from "unpdf";
import {
  isAnalysisDebugEnabled,
  previewText,
  scoreExtractionQuality,
} from "./extract-quality";

export type ExtractionMethod = "native_pdf" | "native_pdf_tables" | "image_fallback" | "none";

export type ExtractionResult = {
  text: string;
  method: ExtractionMethod;
  quality: number; // 0–1
  pageCount: number | null;
  charCount: number;
  reason: string;
  /** Serialized table rows when available (preserves column structure). */
  tablesText: string;
};

export { scoreExtractionQuality, previewText, isAnalysisDebugEnabled };

/**
 * Prefer native PDF text. Uses unpdf (serverless-safe PDF.js) — not pdf-parse,
 * which crashes on Vercel without native canvas/worker setup.
 * Images have no native text here — quality 0, vision fallback later.
 */
export async function extractDocumentText(args: {
  mimeType: string;
  base64: string;
  fileName: string;
}): Promise<ExtractionResult> {
  if (args.mimeType === "application/pdf") {
    try {
      const bytes = Uint8Array.from(Buffer.from(args.base64, "base64"));
      const pdf = await getDocumentProxy(bytes);
      const { totalPages, text: rawText } = await extractText(pdf, {
        mergePages: true,
      });
      // Preserve line breaks / reading order from PDF.js text layer
      const text = String(rawText ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
      const quality = scoreExtractionQuality(text);

      return {
        text,
        tablesText: "",
        method: "native_pdf",
        quality,
        pageCount: typeof totalPages === "number" ? totalPages : null,
        charCount: text.length,
        reason:
          quality >= 0.45
            ? "Native PDF text layer scored usable; OCR skipped."
            : quality < 0.2
              ? "Native PDF text appears sparse or corrupted; prefer file/vision fallback."
              : "Native PDF text is partial; model may also receive the file.",
      };
    } catch {
      return {
        text: "",
        tablesText: "",
        method: "none",
        quality: 0,
        pageCount: null,
        charCount: 0,
        reason: "Native PDF text extraction failed; using file/vision fallback.",
      };
    }
  }

  return {
    text: "",
    tablesText: "",
    method: "image_fallback",
    quality: 0,
    pageCount: null,
    charCount: 0,
    reason: "Image document; relying on vision model (no local OCR).",
  };
}

/** Dev-only diagnostic payload — never returned unless GUARDIAN_ANALYSIS_DEBUG=1. */
export type AnalysisDiagnostic = {
  extraction: ExtractionResult;
  classifierInputPreview: string;
  specialistInputPreview: string;
  rawModelJson?: unknown;
  finalJson?: unknown;
};
