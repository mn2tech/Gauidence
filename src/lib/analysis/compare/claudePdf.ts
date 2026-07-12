import "server-only";

import type { GuardianAnalysis } from "../types";
import {
  buildFileContent,
  createLlmClient,
  runStructuredJson,
  VISUAL_ANALYSIS_MODEL,
  type FilePayload,
  type LlmClient,
  type UserContext,
} from "../llm";
import {
  INVOICE_ANALYSIS_SCHEMA,
  INVOICE_ANALYSIS_SYSTEM,
  materializeInvoiceFromParsed,
} from "../analyzers/invoice";

/**
 * Claude PDF analyzer arm — forces the native PDF `document` block
 * (no page images) so we can compare against OpenAI visual page images.
 */
export async function analyzeInvoiceClaudePdf(
  client: LlmClient,
  file: FilePayload,
  user: UserContext,
  model = VISUAL_ANALYSIS_MODEL
): Promise<GuardianAnalysis> {
  if (file.mimeType !== "application/pdf") {
    throw new Error("Claude PDF arm requires application/pdf.");
  }

  const pdfOnly: FilePayload = {
    ...file,
    inputMode: "visual",
    pageImages: [],
    extraction: file.extraction
      ? { ...file.extraction, pageImages: [] }
      : undefined,
    // Fair visual/PDF bake-off: do not inject text anchors into this arm.
    invoiceAnchors: null,
    extractedText: "",
  };

  const parsed = await runStructuredJson<Record<string, unknown>>(client, {
    system: INVOICE_ANALYSIS_SYSTEM,
    userContent: buildFileContent(
      pdfOnly,
      "Analyze this invoice from the attached PDF. Copy numbers exactly; do not drop digits. Include every line-item row."
    ),
    schemaName: "invoice_analysis",
    schema: INVOICE_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    model,
  });

  return materializeInvoiceFromParsed(parsed, pdfOnly, user);
}

export { createLlmClient };
