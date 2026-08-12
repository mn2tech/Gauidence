import "server-only";

import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import {
  createLlmClient,
  CHAT_MODEL,
  buildFileContent,
  type FilePayload,
} from "@/lib/analysis/llm";
import { extractDocumentText } from "@/lib/analysis/extract";
import {
  ONTOLOGY_EXTRACTION_JSON_SCHEMA,
  parseOntologyExtraction,
} from "../schema";
import type { OntologyExtractionResult } from "../types";
import type { SourceContent } from "@/lib/connectors/content/types";
import {
  extractExcelText,
  isExcelMimeOrName,
} from "@/lib/connectors/content/extractExcel";

const CONNECTOR_ANALYSIS_VERSION = "connector-ontology-v1";

export function connectorAnalysisVersion(): string {
  return CONNECTOR_ANALYSIS_VERSION;
}

function buildConnectorSystemPrompt(): string {
  return `You are Guardian's Ontology Extraction engine for connected device files.
Extract useful personal and business knowledge as entities and relationships.

Rules:
- Prefer Event-centered modeling when appropriate (receipts, tickets, photos of activities).
  Example: Event "Dinner" — OCCURRED_AT → Restaurant "Chipotle"; Event "Movie Night" — WATCHED → Movie.
- Do NOT invent people attending an event unless the source clearly names them.
- Entity types allowed: person, organization, place, event, document, purchase, restaurant, movie, product, date, project, asset, contract, invoice.
- Every relationship MUST include an evidence quote (verbatim or short paraphrase from the source, max 300 chars).
- Include confidence 0.0-1.0 for each entity and relationship.
- Prefer specific names. Avoid generic labels like "Receipt" as an organization.
- Use relationship types when they fit: OCCURRED_AT, PURCHASED_FROM, VISITED, WATCHED, ATTENDED, PART_OF, OWNED_BY, CREATED_BY, EVIDENCED_BY, MENTIONED_IN, RELATED_TO (last resort).
- Also allowed when clear: WORKS_FOR, CLIENT_OF, VENDOR_OF, ISSUED_BY, ISSUED_TO.
- Return empty arrays if there is insufficient evidence.
- Avoid guessing. When uncertain, omit rather than hallucinate.`;
}

/**
 * Extract ontology from temporary source content.
 * Does not upload or store the raw file.
 */
export async function extractOntologyFromSourceContent(args: {
  content: SourceContent;
  spaceName?: string | null;
}): Promise<{
  extraction: OntologyExtractionResult | null;
  contentTextPreview: string;
  extractionMethod: string;
}> {
  const bytes = args.content.bytes;
  const base64 = bytes ? Buffer.from(bytes).toString("base64") : "";
  const mimeType = args.content.mimeType || "application/octet-stream";
  const fileName = args.content.filename;

  let extractedText = (args.content.text ?? "").trim();
  let extractionMethod = extractedText ? "provided_text" : "none";

  if (
    !extractedText &&
    bytes &&
    isExcelMimeOrName(mimeType, fileName)
  ) {
    const excel = extractExcelText({ bytes, fileName });
    extractedText = excel.text.trim();
    extractionMethod = "excel_sheet_text";
  }

  if (!extractedText && base64) {
    const extraction = await extractDocumentText({
      mimeType,
      base64,
      fileName,
    });
    extractedText = extraction.text.trim();
    extractionMethod = extraction.method;

    // Images / scanned PDFs: multimodal ontology extraction.
    if (
      (!extractedText || extraction.quality < 0.45) &&
      (mimeType.startsWith("image/") || mimeType === "application/pdf")
    ) {
      const multimodal = await extractOntologyMultimodal({
        mimeType,
        base64,
        fileName,
        extractedText,
        pageImages: extraction.pageImages,
        spaceName: args.spaceName,
      });
      return {
        extraction: multimodal,
        contentTextPreview: extractedText.slice(0, 200),
        extractionMethod: multimodal ? "multimodal_ontology" : extractionMethod,
      };
    }
  }

  if (!extractedText) {
    return {
      extraction: null,
      contentTextPreview: "",
      extractionMethod,
    };
  }

  const extraction = await extractOntologyConnectorText({
    sourceText: extractedText,
    fileName,
    spaceName: args.spaceName,
  });

  return {
    extraction,
    contentTextPreview: extractedText.slice(0, 200),
    extractionMethod,
  };
}

async function extractOntologyConnectorText(input: {
  sourceText: string;
  fileName: string;
  spaceName?: string | null;
}): Promise<OntologyExtractionResult | null> {
  const text = input.sourceText.trim().slice(0, 12_000);
  if (!text) return null;

  const client = createLlmClient();
  const response = await client.messages.create({
    model: CHAT_MODEL,
    max_tokens: 4096,
    system: buildConnectorSystemPrompt(),
    messages: [
      {
        role: "user",
        content: `Extract ontology from this connected file (${input.fileName})${
          input.spaceName ? ` for space "${input.spaceName}"` : ""
        }:\n\n${text}`,
      },
    ],
    output_config: {
      format: jsonSchemaOutputFormat(ONTOLOGY_EXTRACTION_JSON_SCHEMA),
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return null;
  }
  return parseOntologyExtraction(parsed);
}

async function extractOntologyMultimodal(args: {
  mimeType: string;
  base64: string;
  fileName: string;
  extractedText: string;
  pageImages: Array<{ page: number; dataUrl: string }>;
  spaceName?: string | null;
}): Promise<OntologyExtractionResult | null> {
  const client = createLlmClient();
  const file: FilePayload = {
    mimeType: args.mimeType,
    base64: args.base64,
    fileName: args.fileName,
    extractedText: args.extractedText,
    pageImages: args.pageImages,
    inputMode: "visual",
  };

  const instruction = `${buildConnectorSystemPrompt()}

Return ONLY JSON matching the ontology extraction schema (entities, relationships, events).
File: ${args.fileName}${args.spaceName ? `\nSpace: ${args.spaceName}` : ""}`;

  const content = buildFileContent(file, instruction);

  const response = await client.messages.create({
    model: CHAT_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content }],
    output_config: {
      format: jsonSchemaOutputFormat(ONTOLOGY_EXTRACTION_JSON_SCHEMA),
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return null;
  }
  return parseOntologyExtraction(parsed);
}
