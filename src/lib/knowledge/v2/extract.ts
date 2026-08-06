import "server-only";

import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { createLlmClient, CHAT_MODEL } from "@/lib/analysis/llm";
import {
  KNOWLEDGE_EXTRACTION_JSON_SCHEMA,
  parseKnowledgeExtraction,
} from "./schema";
import type { KnowledgeExtractionResult } from "./types";

export type LlmExtractionInput = {
  sourceText: string;
  fileName: string;
  documentType?: string | null;
  title?: string | null;
  summary?: string | null;
  specialist?: Record<string, unknown> | null;
};

function buildSystemPrompt(): string {
  return `You are Guardian's Knowledge Extraction engine.
Extract structured entities, facts, and relationships from document text.

Rules:
- Every fact MUST include a sourceExcerpt (verbatim quote from the text, max 300 chars).
- Do not invent facts not supported by the text.
- Use entity types: person, organization, project, contract, invoice, document, asset, vehicle, property, policy, account, event, task, location, product, topic, custom.
- Use predicates like: works_for, works_on, belongs_to, owns, has_rate, has_registration, expires_on, billed_to, references, etc.
- For pay rates use predicate has_rate with value and unit (e.g. "$70", unit "hour").
- For expiration dates use expires_on with expirationDate.
- Confidence 0.0-1.0: only include facts you are confident about.
- Prefer specific names over pronouns.
- Link organizations to people and contracts when stated.`;
}

export async function extractKnowledgeWithLlm(
  input: LlmExtractionInput
): Promise<KnowledgeExtractionResult | null> {
  const text = input.sourceText.trim().slice(0, 12_000);
  if (!text) return null;

  const client = createLlmClient();
  const contextParts = [
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
        content: `Extract structured knowledge from this document (${input.fileName}):\n\n${contextParts}`,
      },
    ],
    output_config: {
      format: jsonSchemaOutputFormat(KNOWLEDGE_EXTRACTION_JSON_SCHEMA),
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

  const validated = parseKnowledgeExtraction(parsed);
  if (!validated) return null;

  return {
    entities: validated.entities.map((e) => ({
      name: e.name,
      entityType: e.entityType,
      aliases: e.aliases,
      confidence: e.confidence,
      sourceExcerpt: e.sourceExcerpt,
    })),
    facts: validated.facts.map((f) => ({
      subject: f.subject,
      subjectType: f.subjectType,
      predicate: f.predicate,
      object: f.object,
      objectType: f.objectType,
      value: f.value,
      valueType: f.valueType,
      unit: f.unit,
      effectiveDate: f.effectiveDate,
      expirationDate: f.expirationDate,
      confidence: f.confidence,
      sourceExcerpt: f.sourceExcerpt,
    })),
    relationships: validated.relationships.map((r) => ({
      subject: r.subject,
      relationship: r.relationship,
      object: r.object,
      confidence: r.confidence,
      sourceExcerpt: r.sourceExcerpt,
    })),
  };
}
