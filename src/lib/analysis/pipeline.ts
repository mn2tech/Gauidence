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
  extractDocumentText,
  isAnalysisDebugEnabled,
  previewText,
  type AnalysisDiagnostic,
} from "./extract";

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

/**
 * Extract text → classify → specialist → validate.
 * Does not log document text in production.
 */
export async function runAnalysisPipeline(
  file: FilePayload,
  user: UserContext,
  onProgress?: PipelineProgress
): Promise<PipelineResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await onProgress?.("extracting");
  const extraction = await extractDocumentText({
    mimeType: file.mimeType,
    base64: file.base64,
    fileName: file.fileName,
  });

  const enriched: FilePayload = {
    ...file,
    extractedText: extraction.text,
    extraction,
  };

  if (extraction.quality < 0.2 && file.mimeType === "application/pdf") {
    // Continue with file fallback — do not silently pretend extraction is fine.
    // Specialist still receives the PDF binary via buildFileContent.
  }

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

  if (extraction.quality > 0 && extraction.quality < 0.45) {
    analysis.warnings.push(
      "Document text extraction quality was low — verify all numbers and dates against the original file."
    );
    analysis.overall_confidence = Math.min(analysis.overall_confidence, 0.7);
  }

  const beforeValidation = structuredClone(analysis);

  await onProgress?.("validating");
  analysis = validateAnalysis(analysis);

  if (analysis.overall_confidence < 0.75) {
    analysis.guardian_status = "needs_verification";
  }

  // Strip internal debug payload from specialist before save/display
  if (analysis.specialist && "__raw_model" in analysis.specialist) {
    const { __raw_model: _, ...rest } = analysis.specialist;
    analysis.specialist = rest;
  }

  const result: PipelineResult = {
    classification,
    routedTo,
    analysis,
    model: ANALYSIS_MODEL,
  };

  if (isAnalysisDebugEnabled()) {
    result.diagnostic = {
      extraction,
      classifierInputPreview: previewText(extraction.text || "[no native text]"),
      specialistInputPreview: previewText(extraction.text || "[file/vision fallback]"),
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
