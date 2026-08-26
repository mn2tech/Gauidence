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
import { capSourceText } from "@/lib/vault/sourceText";
import { classificationFromFileName } from "./filenameHints";
import { enrichAnalysisFromImageTranscription } from "./imageNotes";
import { shouldAnalyzeImageWithVision } from "@/lib/vision/routeAsset";
import { getVisionProvider } from "@/lib/vision/provider";
import { prepareImageForVision } from "@/lib/vision/prepareImage";
import {
  buildVisionSourceText,
  mapVisionResultToAnalysis,
} from "@/lib/vision/mapAnalysis";
import { logVisionEvent } from "@/lib/vision/log";
import type { VisionResult } from "@/lib/vision/types";
import { AnalysisLlmError } from "@/lib/analysis/llmErrors";

/** Max chars stored/indexed from extraction (large PDFs are truncated). */
export { SOURCE_TEXT_MAX_CHARS, capSourceText } from "@/lib/vault/sourceText";

export type PipelineProgress = (status: AnalysisStatus) => Promise<void> | void;

export type PipelineResult = {
  classification: Classification;
  routedTo: string;
  analysis: GuardianAnalysis;
  model: string;
  inputMode?: AnalysisInputMode;
  /** Full extracted/OCR text (capped) for persistence and vault indexing. */
  sourceText: string | null;
  diagnostic?: AnalysisDiagnostic;
  analysisType?: "vision" | "document" | "generic";
  vision?: {
    status: "analyzed" | "failed";
    model?: string;
    result?: VisionResult;
    error?: string;
  };
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

function asTextOnlyPdf(file: FilePayload): FilePayload {
  return {
    ...file,
    inputMode: "text",
    pageImages: [],
    extraction: file.extraction
      ? { ...file.extraction, pageImages: [] }
      : file.extraction,
  };
}

/** Retry PDF analysis with extracted text when the native PDF block fails. */
async function withPdfTextFallback<T>(
  file: FilePayload,
  run: (payload: FilePayload) => Promise<T>
): Promise<T> {
  try {
    return await run(file);
  } catch (err) {
    const text = file.extractedText?.trim() ?? "";
    if (
      !(err instanceof AnalysisLlmError) ||
      file.mimeType !== "application/pdf" ||
      file.inputMode === "text" ||
      text.length < 200
    ) {
      throw err;
    }
    console.warn("PDF Claude request failed; retrying with extracted text only", {
      code: err.code,
      fileName: file.fileName,
    });
    return run(asTextOnlyPdf(file));
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

async function runImageVisionPipeline(
  file: FilePayload,
  user: UserContext,
  onProgress?: PipelineProgress
): Promise<PipelineResult> {
  await onProgress?.("analyzing");
  const started = Date.now();
  // Keep the job lease fresh during long Claude vision calls so status polls
  // do not mark a live worker as timed out.
  const heartbeat = setInterval(() => {
    void onProgress?.("analyzing");
  }, 45_000);
  logVisionEvent("vision_started", {
    documentId: user.documentId,
    spaceId: user.profileId,
  });

  try {
    let prepared;
    try {
      prepared = await prepareImageForVision({
        mimeType: file.mimeType,
        base64: file.base64,
        fileName: file.fileName,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "This image format couldn't be prepared for analysis.";
      logVisionEvent("vision_failed", {
        documentId: user.documentId,
        spaceId: user.profileId,
        durationMs: Date.now() - started,
        error: message,
      });
      throw err instanceof AnalysisLlmError
        ? err
        : new AnalysisLlmError(message, 422, "vision_prepare_failed");
    }

    const visionFile: FilePayload = {
      ...file,
      mimeType: prepared.mimeType,
      base64: prepared.base64,
      inputMode: "visual",
      pageImages: [],
    };

    try {
      const { result, model } = await getVisionProvider().analyzeImage({
        fileName: file.fileName,
        mimeType: prepared.mimeType,
        base64: prepared.base64,
        spaceName: user.spaceName,
      });
      let analysis = mapVisionResultToAnalysis(result, file.fileName);
      analysis = validateAnalysis(analysis);
      if (analysis.overall_confidence < 0.75) {
        analysis.guardian_status = "needs_verification";
      }
      logVisionEvent("vision_completed", {
        documentId: user.documentId,
        spaceId: user.profileId,
        durationMs: Date.now() - started,
        model,
      });
      return {
        classification: {
          document_type: analysis.document_type,
          document_subtype: result.document_type || "image",
          classification_confidence: result.confidence,
          classification_reason: "Guardian Vision image analysis",
        },
        routedTo: "vision",
        analysis,
        model,
        inputMode: "visual",
        sourceText: capSourceText(buildVisionSourceText(result, file.fileName)),
        analysisType: "vision",
        vision: { status: "analyzed", model, result },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Vision analysis failed.";
      logVisionEvent("vision_failed", {
        documentId: user.documentId,
        spaceId: user.profileId,
        durationMs: Date.now() - started,
        error: message,
      });
      // Fallback: keep the original image on a visual specialist pass.
      // Never treat empty OCR as success, and never switch this image to text-only.
      try {
        const client = createLlmClient();
        await onProgress?.("classifying");
        const classification = await classifyDocument(client, visionFile);
        const routedTo = resolveAnalyzerType(classification, IMPLEMENTED_SPECIALISTS);
        await onProgress?.("analyzing");
        const { analysis: rawAnalysis } = await runSpecialist(
          client,
          routedTo,
          visionFile,
          user,
          classification.document_type
        );
        let analysis = validateAnalysis(rawAnalysis);
        const hasDescription =
          Boolean(analysis.summary?.trim()) ||
          Boolean(analysis.title?.trim()) ||
          (analysis.facts ?? []).some((f) => String(f.value ?? "").trim());
        if (!hasDescription) {
          throw err;
        }
        if (analysis.overall_confidence < 0.75) {
          analysis.guardian_status = "needs_verification";
        }
        return {
          classification,
          routedTo,
          analysis,
          model: VISUAL_ANALYSIS_MODEL,
          inputMode: "visual",
          sourceText: capSourceText(analysis.summary || analysis.title || ""),
          analysisType: "vision",
          vision: {
            status: "analyzed",
            model: VISUAL_ANALYSIS_MODEL,
            result: {
              document_type: analysis.document_type,
              description: analysis.summary || "",
              transcription: "",
              summary: analysis.summary || "",
              entities: [],
              dates: [],
              amounts: [],
              facts: [],
              tasks: [],
              confidence: analysis.overall_confidence,
            },
          },
        };
      } catch {
        throw err instanceof AnalysisLlmError
          ? err
          : new AnalysisLlmError(message, 502, "vision_failed");
      }
    }
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Detect → prepare visual/text → Claude multimodal structured analysis → validate.
 * Images use Guardian Vision (not OCR-as-success). Does not log full document text.
 */
export async function runAnalysisPipeline(
  file: FilePayload,
  user: UserContext,
  onProgress?: PipelineProgress
): Promise<PipelineResult> {
  if (shouldAnalyzeImageWithVision(file.mimeType, file.fileName)) {
    return runImageVisionPipeline(file, user, onProgress);
  }

  const client = createLlmClient();

  await onProgress?.("extracting");
  let extraction = await extractDocumentText({
    mimeType: file.mimeType,
    base64: file.base64,
    fileName: file.fileName,
  });

  const isImageUpload = file.mimeType.startsWith("image/");

  let characteristics = detectDocumentCharacteristics({
    mimeType: file.mimeType,
    extraction,
  });
  let inputMode = resolveAnalysisInputMode(characteristics);

  let ocrText: string | undefined;
  // Photos have no native text layer — always OCR once so source_text and RAG work.
  if (isImageUpload && extraction.quality < 0.45) {
    const ocr = await transcribeDocument({
      client,
      fileName: file.fileName,
      mimeType: file.mimeType,
      base64: file.base64,
      pageImages: extraction.pageImages,
    });
    ocrText = ocr.text;
    if (ocr.text.trim()) {
      const report = assessExtractionQuality(ocr.text);
      extraction = {
        ...extraction,
        text: ocr.text,
        method: "vision_ocr",
        quality: Math.max(ocr.quality, report.score),
        charCount: ocr.text.length,
        issues: [...new Set([...extraction.issues, ...ocr.issues, ...report.issues])],
        estimatedLineRows: report.estimatedLineRows,
        reason:
          "Image transcribed with vision OCR for vault memory, search, and analysis.",
      };
      characteristics = detectDocumentCharacteristics({
        mimeType: file.mimeType,
        extraction,
      });
      inputMode =
        extraction.quality >= 0.45
          ? "text"
          : resolveAnalysisInputMode(characteristics);
    }
  } else if (inputMode !== "visual" && extraction.quality < 0.45) {
    const fallback = await maybeOcrFallback(client, file, extraction);
    extraction = fallback.extraction;
    ocrText = fallback.ocrText;
  }

  if (
    inputMode === "visual" &&
    file.mimeType === "application/pdf" &&
    extraction.text.trim().length >= 500
  ) {
    inputMode = "text";
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
  const fileNameHint = classificationFromFileName(file.fileName);
  const classification =
    fileNameHint ??
    (await withPdfTextFallback(enriched, (payload) =>
      classifyDocument(client, payload)
    ));
  const routedTo = resolveAnalyzerType(classification, IMPLEMENTED_SPECIALISTS);

  await onProgress?.("analyzing");
  const { analysis: rawAnalysis, rawModelJson } = await withPdfTextFallback(
    enriched,
    (payload) => runSpecialist(client, routedTo, payload, user, classification.document_type)
  );
  let analysis = rawAnalysis;

  if (isImageUpload && extraction.method === "vision_ocr" && extraction.text.trim()) {
    analysis = enrichAnalysisFromImageTranscription(analysis, extraction.text);
  }

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
    sourceText: capSourceText(extraction.text),
    analysisType: "document",
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
