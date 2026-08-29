import "server-only";

import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { createLlmClient, CHAT_MODEL } from "@/lib/analysis/llm";
import { formatOntologyForPrompt } from "./ontology";
import {
  SEMANTIC_EXTRACTION_JSON_SCHEMA,
  parseSemanticExtraction,
} from "./schema";
import { logSemanticEvent } from "./log";
import type {
  SemanticExtractionInput,
  SemanticExtractionResult,
} from "./types";

function buildSystemPrompt(): string {
  return `You are Guardian's Semantic Extraction engine.
Convert unstructured information into canonical entities, relationships, and atomic facts.

${formatOntologyForPrompt()}

Rules:
1. Do not infer unsupported facts. Only extract what the text explicitly supports.
2. Separate explicit facts from plausible guesses — put guesses in warnings, not entities/relationships/facts.
3. Include confidence 0.0-1.0 for every assertion.
4. Prefer short evidence quotes in relationship/fact "evidence" fields (verbatim, max 300 chars).
5. Normalize dates to ISO when clear (e.g. September 15, 2026 → 2026-09-15).
6. Normalize dollar amounts as valueNumber when possible.
7. Preserve original display names for people and organizations (do not rewrite branding).
8. Do not create entities for meaningless nouns (Monday, page, document, etc.).
9. Do not create duplicate entities for minor spelling/capitalization differences — reuse temporaryIds and put variants in aliases.
10. Use temporaryId like "e1", "e2" and reference those ids in relationships.source/target and facts.subject.
11. Prefer specific relationship types over related_to / associated_with.
12. Roles like "CI/CD engineer" should be facts (predicate: role) or topic entities only when clearly named as a subject — do not invent new entity types.
13. Return empty arrays when evidence is insufficient.
14. Avoid guessing. When uncertain, omit rather than hallucinate.`;
}

/**
 * Extract semantic knowledge from content using the project's LLM abstraction.
 * Returns validated structured JSON or an empty result on failure (never throws for parse issues).
 */
export async function extractSemanticKnowledge(
  input: SemanticExtractionInput
): Promise<SemanticExtractionResult> {
  const empty: SemanticExtractionResult = {
    entities: [],
    relationships: [],
    facts: [],
    actions: [],
    warnings: [],
  };

  const content = input.content.trim().slice(0, 12_000);
  if (!content) {
    return { ...empty, warnings: ["empty_content"] };
  }

  logSemanticEvent("semantic_extraction_started", {
    user_id: input.userId,
    space_id: input.spaceId ?? null,
    source_type: input.sourceType,
    source_id: input.sourceId,
    content_len: content.length,
  });

  try {
    const client = createLlmClient();
    const contextParts = [
      input.sourceTitle ? `Title: ${input.sourceTitle}` : null,
      input.spaceId ? `Space ID: ${input.spaceId}` : null,
      `Source type: ${input.sourceType}`,
      "",
      "Content:",
      content,
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
          content: `Extract semantic knowledge:\n\n${contextParts}`,
        },
      ],
      output_config: {
        format: jsonSchemaOutputFormat(SEMANTIC_EXTRACTION_JSON_SCHEMA),
      },
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      logSemanticEvent("semantic_extraction_failed", {
        user_id: input.userId,
        source_id: input.sourceId,
        reason: "no_text_block",
      });
      return { ...empty, warnings: ["no_llm_text_block"] };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(block.text);
    } catch {
      logSemanticEvent("semantic_extraction_failed", {
        user_id: input.userId,
        source_id: input.sourceId,
        reason: "json_parse_error",
      });
      return { ...empty, warnings: ["json_parse_error"] };
    }

    const result = parseSemanticExtraction(raw);
    if (!result) {
      logSemanticEvent("semantic_extraction_failed", {
        user_id: input.userId,
        source_id: input.sourceId,
        reason: "schema_validation_failed",
      });
      return { ...empty, warnings: ["schema_validation_failed"] };
    }

    logSemanticEvent("semantic_extraction_completed", {
      user_id: input.userId,
      source_id: input.sourceId,
      entities: result.entities.length,
      relationships: result.relationships.length,
      facts: result.facts.length,
      warnings: result.warnings.length,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "extraction_failed";
    logSemanticEvent("semantic_extraction_failed", {
      user_id: input.userId,
      source_id: input.sourceId,
      reason: message.slice(0, 200),
    });
    return { ...empty, warnings: [message.slice(0, 200)] };
  }
}
