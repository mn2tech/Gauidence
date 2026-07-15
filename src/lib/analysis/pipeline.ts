import "server-only";

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
import {
  ANALYSIS_MODEL,
  VISUAL_ANALYSIS_MODEL,
  createLlmClient,
  type FilePayload,
  type LlmClient,
  type UserContext,
} from "./llm";
import {
  extractDocumentText,
  isAnalysisDebugEnabled,
  previewText,
  type AnalysisDiagnostic,
  type ExtractionResult,
} from "./extract";
import { transcribeDocument } from "./ocr";
import { assessExtractionQuality } from "./extract-quality";
import { parseInvoiceFromText } from "./invoiceText";
import {
  detectDocumentCharacteristics,
  resolveAnalysisInputMode,
  type AnalysisInputMode,
} from "./inputMode";

export type PipelineProgress = (status: AnalysisStatus) => Promise<void> | void;

export type PipelineResult = {
  classification: Classification;
  routedTo: string;
  analysis: GuardianAnalysis;
  model: string;
  inputMode?: AnalysisInputMode;
  diagnostic?: AnalysisDiagnostic;
};

async function runSpecialist(
  client: LlmClient,
  type: ReturnType<typeof resolveAnalyzerType>,
  file: FilePayload,
  user: UserContext,
  classifiedType: Classification["document_type"]
): Promise<{ analysis: GuardianAnalysis; rawModelJson?: unknown }> {
  switch (type) {
    case "invoice": {
      const analysis = await analyzeInvoice(client, file, user);
      return { analysis, rawModelJson: analysis.specialist.__raw_model };
    }
    case "insurance":
      return { analysis: await analyzeInsurance(client, file) };
    case "contract":
      return { analysis: await analyzeContract(client, file) };
    case "receipt":
      return { analysis: await analyzeReceipt(client, file) };
    default:
      return { analysis: await analyzeGeneral(client, file, classifiedType) };
  }
}

async function maybeOcrFallback(
  client: LlmClient,
  file: FilePayload,
  extraction: ExtractionResult
): Promise<{ extraction: ExtractionResult; ocrText?: string }> {
  if (extraction.pageImages.length > 0) {
    return { extraction };
  }
  if (extraction.quality >= 0.45) {
    return { extraction };
  }

  const ocr = await transcribeDocument({
    client,
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
          "No page images available; used vision OCR transcription as text fallback.",
        pageImages: [],
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
 * Detect → prepare visual/text → Claude multimodal structured analysis → validate.
 * Does not log full document text in production.
 */
export async function runAnalysisPipeline(
  file: FilePayload,
  user: UserContext,
  onProgress?: PipelineProgress
): Promise<PipelineResult> {
  const client = createLlmClient();

  await onProgress?.("extracting");
  let extraction = await extractDocumentText({
    mimeType: file.mimeType,
    base64: file.base64,
    fileName: file.fileName,
  });

  const characteristics = detectDocumentCharacteristics({
    mimeType: file.mimeType,
    extraction,
  });
  const inputMode = resolveAnalysisInputMode(characteristics);

  let ocrText: string | undefined;
  // Visual mode already sends the PDF/image to Claude — a separate OCR pass
  // doubles latency and commonly pushes past the serverless timeout.
  if (inputMode !== "visual" && extraction.quality < 0.45) {
    const fallback = await maybeOcrFallback(client, file, extraction);
    extraction = fallback.extraction;
    ocrText = fallback.ocrText;
  }

  const invoiceAnchors =
    extraction.method !== "vision_ocr" && extraction.quality >= 0.45
      ? parseInvoiceFromText(extraction.text)
      : null;

  const enriched: FilePayload = {
    ...file,
    extractedText: extraction.text,
    extraction,
    pageImages: extraction.pageImages,
    invoiceAnchors,
    inputMode,
  };

  await onProgress?.("classifying");
  const classification = await classifyDocument(client, enriched);
  const routedTo = resolveAnalyzerType(classification, IMPLEMENTED_SPECIALISTS);

  await onProgress?.("analyzing");
  const { analysis: rawAnalysis, rawModelJson } = await runSpecialist(
    client,
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

  if (inputMode !== "visual" && extraction.quality < 0.45) {
    analysis.warnings.push(
      "Document text extraction quality was low — verify all numbers and dates against the original file."
    );
    analysis.overall_confidence = Math.min(analysis.overall_confidence, 0.7);
    analysis.guardian_status = "needs_verification";
  }

  analysis.specialist = {
    ...analysis.specialist,
    __extraction_estimated_line_rows: extraction.estimatedLineRows,
    __extraction_quality: extraction.quality,
    __source_text_excerpt: extraction.text.slice(0, 4000),
    __input_mode: inputMode,
  };

  const beforeValidation = structuredClone(analysis);

  await onProgress?.("validating");
  analysis = validateAnalysis(analysis);

  if (analysis.overall_confidence < 0.75) {
    analysis.guardian_status = "needs_verification";
  }

  if (analysis.specialist) {
    const {
      __raw_model: _r,
      __extraction_estimated_line_rows: _e,
      __extraction_quality: _q,
      __source_text_excerpt: _s,
      __input_mode: _m,
      ...rest
    } = analysis.specialist as Record<string, unknown>;
    analysis.specialist = rest;
  }

  const usedModel =
    inputMode === "text" ? ANALYSIS_MODEL : VISUAL_ANALYSIS_MODEL;

  const result: PipelineResult = {
    classification,
    routedTo,
    analysis,
    model: usedModel,
    inputMode,
  };

  if (isAnalysisDebugEnabled()) {
    const { pageImages, ...extractionSafe } = extraction;
    result.diagnostic = {
      extraction: {
        ...extractionSafe,
        pageImageCount: pageImages.length,
      },
      classifierInputPreview: previewText(
        inputMode === "visual"
          ? `[visual mode — ${pageImages.length} page image(s)]`
          : extraction.text || "[no text]"
      ),
      specialistInputPreview: previewText(
        inputMode === "visual"
          ? `[visual multimodal → ${usedModel}]`
          : extraction.text || "[fallback]"
      ),
      ocrTextPreview: ocrText ? previewText(ocrText) : undefined,
      rawModelJson: rawModelJson ?? beforeValidation.specialist,
      finalJson: {
        document_type: analysis.document_type,
        specialist: analysis.specialist,
        facts: analysis.facts,
        warnings: analysis.warnings,
        guardian_status: analysis.guardian_status,
        overall_confidence: analysis.overall_confidence,
        input_mode: inputMode,
        model: usedModel,
      },
    };
  }

  return result;
}
