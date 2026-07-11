import "server-only";

import type OpenAI from "openai";
import type { Classification, DocumentType } from "./types";
import { buildFileContent, modelForInputMode, runStructuredJson, type FilePayload } from "./openai";
import { resolveAnalyzerType } from "./route";

export { resolveAnalyzerType };

const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    document_type: {
      type: "string",
      enum: [
        "invoice",
        "insurance",
        "contract",
        "receipt",
        "passport",
        "drivers_license",
        "warranty",
        "tax_document",
        "general",
      ],
    },
    document_subtype: { type: "string" },
    classification_confidence: { type: "number" },
    classification_reason: { type: "string" },
  },
  required: [
    "document_type",
    "document_subtype",
    "classification_confidence",
    "classification_reason",
  ],
} as const;

const SYSTEM = `You classify personal and business documents for Guardian.
Pick exactly one document_type. Be conservative: if uncertain, use "general" and lower confidence.
Never invent details. classification_confidence is 0–1.`;

export async function classifyDocument(
  openai: OpenAI,
  file: FilePayload
): Promise<Classification> {
  const parsed = await runStructuredJson<{
    document_type: DocumentType;
    document_subtype: string;
    classification_confidence: number;
    classification_reason: string;
  }>(openai, {
    system: SYSTEM,
    userContent: buildFileContent(
      file,
      "Classify this document. Return document_type, subtype, confidence (0-1), and a short reason."
    ),
    schemaName: "document_classification",
    schema: CLASSIFY_SCHEMA as unknown as Record<string, unknown>,
    model: modelForInputMode(file.inputMode),
  });

  const confidence = Math.max(
    0,
    Math.min(1, Number(parsed.classification_confidence) || 0)
  );

  return {
    document_type: parsed.document_type ?? "general",
    document_subtype: parsed.document_subtype ?? "",
    classification_confidence: confidence,
    classification_reason: parsed.classification_reason ?? "",
  };
}
