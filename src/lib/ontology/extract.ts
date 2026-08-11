import "server-only";

import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { createLlmClient, CHAT_MODEL } from "@/lib/analysis/llm";
import {
  ONTOLOGY_EXTRACTION_JSON_SCHEMA,
  parseOntologyExtraction,
} from "./schema";
import type { OntologyExtractionResult } from "./types";

export type OntologyLlmInput = {
  sourceText: string;
  fileName: string;
  documentType?: string | null;
  title?: string | null;
  summary?: string | null;
  spaceName?: string | null;
  specialist?: Record<string, unknown> | null;
};

function buildSystemPrompt(): string {
  return `You are Guardian's Ontology Extraction engine.
Extract business-relevant entities and relationships from document text.

Rules:
- Extract only materially useful business entities: people, organizations, projects, assets, contracts, invoices.
- Do NOT create entities from every noun (e.g. "Monday", "document", "page", tools casually listed on a resume).
- Every relationship MUST include an evidence quote (verbatim from the text, max 300 chars).
- Do not invent relationships without supporting text.
- Include confidence 0.0-1.0 for each entity and relationship.
- Prefer specific names over pronouns.
- Use entity types: person, organization, project, asset, contract, invoice, document.

Relationship types (prefer the MOST SPECIFIC that fits):
WORKS_FOR, REPORTS_TO, MANAGES, FOUNDER_OF, OWNS, HAS_PROJECT, HAS_CONTRACT, HAS_INVOICE, BELONGS_TO, SERVICES, CLIENT_OF, VENDOR_OF, PARTNER_OF, ISSUED_BY, ISSUED_TO, SUBCONTRACTOR_TO, PRIME_CONTRACTOR_FOR, MENTIONED_IN.

- Use RELATED_TO ONLY as a last resort when a real business relationship is stated but none of the specific types fit. Do NOT use RELATED_TO for co-mentions, skill lists, vendor logos, or "tools used" on a resume/CV.
- Do NOT link every organization mentioned in a resume to each other with RELATED_TO.
- Person ↔ employer → WORKS_FOR (or FOUNDER_OF). Person ↔ client → CLIENT_OF / SERVICES when clear.
- Organization ↔ organization: prefer SUBCONTRACTOR_TO, PARTNER_OF, CLIENT_OF, VENDOR_OF, SERVICES over RELATED_TO.
- Entity ↔ source document → MENTIONED_IN only (do not invent other document edges).

- Return empty arrays if there is insufficient evidence.
- Avoid guessing. When uncertain, omit rather than hallucinate.`;
}

export async function extractOntologyWithLlm(
  input: OntologyLlmInput
): Promise<OntologyExtractionResult | null> {
  const text = input.sourceText.trim().slice(0, 12_000);
  if (!text) return null;

  const client = createLlmClient();
  const contextParts = [
    input.spaceName ? `Space: ${input.spaceName}` : null,
    input.title ? `Title: ${input.title}` : null,
    input.documentType ? `Document type: ${input.documentType}` : null,
    input.summary ? `Summary: ${input.summary}` : null,
    input.specialist
      ? `Specialist fields: ${JSON.stringify(input.specialist).slice(0, 2000)}`
      : null,
    "",
    "Document text:",
    text,
  ]
    .filter((p) => p !== null)
    .join("\n");

  const response = await client.messages.create({
    model: CHAT_MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: `Extract ontology from this document (${input.fileName}):\n\n${contextParts}`,
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
