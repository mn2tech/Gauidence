import "server-only";

import OpenAI from "openai";
import type {
  AnalysisStatus,
  Classification,
  GuardianAnalysis,
} from "./types";
import { IMPLEMENTED_SPECIALISTS } from "./types";
import { classifyDocument } from "./classify";
import { resolveAnalyzerType } from "./route";
import { validateAnalysis } from "./validate";
import { analyzeInvoice } from "./analyzers/invoice";
import { analyzeInsurance } from "./analyzers/insurance";
import { analyzeContract } from "./analyzers/contract";
import { analyzeReceipt } from "./analyzers/receipt";
import { analyzeGeneral } from "./analyzers/general";
import { ANALYSIS_MODEL, type FilePayload, type UserContext } from "./openai";
import {
  assessExtractionQuality,
  extractDocumentText,
  isAnalysisDebugEnabled,
  previewText,
  type AnalysisDiagnostic,
  type ExtractionResult,
} from "./extract";
import { transcribeDocument } from "./ocr";
import { parseInvoiceFromText } from "./invoiceText";

export type PipelineProgress = (status: AnalysisStatus) => Promise<void> | void;

export type PipelineResult = {
  classification: Classification;
  routedTo: string;
  analysis: GuardianAnalysis;
  model: string;
  diagnostic?: AnalysisDiagnostic;
};

async function runSpecialist(
  openai: OpenAI,
  type: ReturnType<typeof resolveAnalyzerType>,
  file: FilePayload,
  user: UserContext,
  classifiedType: Classification["document_type"]
): Promise<{ analysis: GuardianAnalysis; rawModelJson?: unknown }> {
  switch (type) {
    case "invoice": {
      const analysis = await analyzeInvoice(openai, file, user);
      return { analysis, rawModelJson: analysis.specialist.__raw_model };
    }
    case "insurance":
      return { analysis: await analyzeInsurance(openai, file) };
    case "contract":
      return { analysis: await analyzeContract(openai, file) };
    case "receipt":
      return { analysis: await analyzeReceipt(openai, file) };
    default:
      return { analysis: await analyzeGeneral(openai, file, classifiedType) };
  }
}

async function maybeOcrFallback(
  openai: OpenAI,
  file: FilePayload,
  extraction: ExtractionResult
): Promise<{ extraction: ExtractionResult; ocrText?: string }> {
  if (extraction.quality >= 0.45) {
    return { extraction };
  }

  // Image uploads: treat as OCR source via pageImages empty → file/image path in OCR
  const ocr = await transcribeDocument({
    openai,
    fileName: file.fileName,
    mimeType: file.mimeType,
    base64: file.base64,
    pageImages: extraction.pageImages,
  });

  const nativeScore = extraction.quality;
  const ocrScore = ocr.quality;
  if (ocrScore > nativeScore) {
    const report = assessExtractionQuality(ocr.text);
    return {
      ocrText: ocr.text,
      extraction: {
        ...extraction,
        text: ocr.text,
        method: "vision_ocr",
        quality: ocrScore,
        charCount: ocr.text.length,
        issues: [...new Set([...extraction.issues, ...ocr.issues, ...report.issues])],
        estimatedLineRows: report.estimatedLineRows,
        reason:
          nativeScore < 0.2
            ? "Native text layer empty/unusable; used vision OCR transcription of page images."
            : "Vision OCR scored higher than native extraction; using OCR text.",
        // Keep page images only if OCR still weak (analyzer may need them)
        pageImages: ocrScore >= 0.45 ? [] : extraction.pageImages,
      },
    };
  }

  return {
    ocrText: ocr.text,
    extraction: {
      ...extraction,
      issues: [...extraction.issues, "ocr_not_better_than_native", ...ocr.issues],
      reason: `${extraction.reason} OCR attempted but did not improve quality.`,
    },
  };
}

/**
 * Extract text → OCR if needed → classify → specialist → validate.
 * Does not log full document text in production.
 */
export async function runAnalysisPipeline(
  file: FilePayload,
  user: UserContext,
  onProgress?: PipelineProgress
): Promise<PipelineResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await onProgress?.("extracting");
  let extraction = await extractDocumentText({
    mimeType: file.mimeType,
    base64: file.base64,
    fileName: file.fileName,
  });

  let ocrText: string | undefined;
  if (extraction.quality < 0.45) {
    const fallback = await maybeOcrFallback(openai, file, extraction);
    extraction = fallback.extraction;
    ocrText = fallback.ocrText;
  }

  const invoiceAnchors =
    extraction.text.trim().length > 0
      ? parseInvoiceFromText(extraction.text)
      : null;

  const enriched: FilePayload = {
    ...file,
    extractedText: extraction.text,
    extraction,
    pageImages: extraction.pageImages,
    invoiceAnchors,
  };

  await onProgress?.("classifying");
  const classification = await classifyDocument(openai, enriched);
  const routedTo = resolveAnalyzerType(classification, IMPLEMENTED_SPECIALISTS);

  await onProgress?.("analyzing");
  const { analysis: rawAnalysis, rawModelJson } = await runSpecialist(
    openai,
    routedTo,
    enriched,
    user,
    classification.document_type
  );
  let analysis = rawAnalysis;

  if (classification.classification_confidence < 0.8) {
    analysis.warnings.push(
      "Document type classification is uncertain — treat extracted details as needing verification."
    );
    analysis.overall_confidence = Math.min(
      analysis.overall_confidence,
      classification.classification_confidence
    );
  }

  if (extraction.quality < 0.45) {
    analysis.warnings.push(
      "Document text extraction quality was low — verify all numbers and dates against the original file."
    );
    analysis.overall_confidence = Math.min(analysis.overall_confidence, 0.7);
    analysis.guardian_status = "needs_verification";
  }

  // Stash extraction row estimate for completeness checks
  analysis.specialist = {
    ...analysis.specialist,
    __extraction_estimated_line_rows: extraction.estimatedLineRows,
    __extraction_quality: extraction.quality,
    __source_text_excerpt: extraction.text.slice(0, 4000),
  };

  const beforeValidation = structuredClone(analysis);

  await onProgress?.("validating");
  analysis = validateAnalysis(analysis);

  if (analysis.overall_confidence < 0.75) {
    analysis.guardian_status = "needs_verification";
  }

  // Strip internal debug payload from specialist before save/display
  if (analysis.specialist) {
    const {
      __raw_model: _r,
      __extraction_estimated_line_rows: _e,
      __extraction_quality: _q,
      __source_text_excerpt: _s,
      ...rest
    } = analysis.specialist as Record<string, unknown>;
    analysis.specialist = rest;
  }

  const result: PipelineResult = {
    classification,
    routedTo,
    analysis,
    model: ANALYSIS_MODEL,
  };

  if (isAnalysisDebugEnabled()) {
    const { pageImages, ...extractionSafe } = extraction;
    result.diagnostic = {
      extraction: {
        ...extractionSafe,
        pageImageCount: pageImages.length,
      },
      classifierInputPreview: previewText(extraction.text || "[no text]"),
      specialistInputPreview: previewText(extraction.text || "[vision fallback]"),
      ocrTextPreview: ocrText ? previewText(ocrText) : undefined,
      rawModelJson: rawModelJson ?? beforeValidation.specialist,
      finalJson: {
        document_type: analysis.document_type,
        specialist: analysis.specialist,
        facts: analysis.facts,
        warnings: analysis.warnings,
        guardian_status: analysis.guardian_status,
        overall_confidence: analysis.overall_confidence,
      },
    };
  }

  return result;
}
