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

export type PipelineProgress = (status: AnalysisStatus) => Promise<void> | void;

export type PipelineResult = {
  classification: Classification;
  routedTo: string;
  analysis: GuardianAnalysis;
  model: string;
};

async function runSpecialist(
  openai: OpenAI,
  type: ReturnType<typeof resolveAnalyzerType>,
  file: FilePayload,
  user: UserContext,
  classifiedType: Classification["document_type"]
): Promise<GuardianAnalysis> {
  switch (type) {
    case "invoice":
      return analyzeInvoice(openai, file, user);
    case "insurance":
      return analyzeInsurance(openai, file);
    case "contract":
      return analyzeContract(openai, file);
    case "receipt":
      return analyzeReceipt(openai, file);
    default:
      return analyzeGeneral(openai, file, classifiedType);
  }
}

/**
 * UPLOAD file bytes already available → classify → specialist → validate.
 * Does not log document text.
 */
export async function runAnalysisPipeline(
  file: FilePayload,
  user: UserContext,
  onProgress?: PipelineProgress
): Promise<PipelineResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await onProgress?.("extracting");
  await onProgress?.("classifying");
  const classification = await classifyDocument(openai, file);

  const routedTo = resolveAnalyzerType(classification, IMPLEMENTED_SPECIALISTS);

  await onProgress?.("analyzing");
  let analysis = await runSpecialist(
    openai,
    routedTo,
    file,
    user,
    classification.document_type
  );

  if (classification.classification_confidence < 0.8) {
    analysis.warnings.push(
      "Document type classification is uncertain — treat extracted details as needing verification."
    );
    analysis.overall_confidence = Math.min(
      analysis.overall_confidence,
      classification.classification_confidence
    );
  }

  await onProgress?.("validating");
  analysis = validateAnalysis(analysis);

  if (analysis.overall_confidence < 0.75) {
    analysis.guardian_status = "needs_verification";
  }

  return {
    classification,
    routedTo,
    analysis,
    model: ANALYSIS_MODEL,
  };
}
