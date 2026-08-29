import { z } from "zod";
import {
  ENTITY_TYPE_SET,
  RELATIONSHIP_TYPE_SET,
} from "./ontology";
import type { SemanticExtractionResult } from "./types";
import { normalizeDateValue, normalizeDollarAmount } from "./normalize";

const ExtractedEntitySchema = z.object({
  temporaryId: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  description: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(1),
});

const ExtractedRelationshipSchema = z.object({
  source: z.string().min(1),
  type: z.string().min(1),
  target: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const ExtractedFactSchema = z.object({
  subject: z.string().optional(),
  predicate: z.string().min(1),
  valueText: z.string().optional(),
  valueNumber: z.number().optional(),
  valueDate: z.string().optional(),
  valueJson: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional(),
});

const ExtractedActionSchema = z.object({
  type: z.string().min(1),
  description: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const SemanticExtractionSchema = z.object({
  entities: z.array(ExtractedEntitySchema).default([]),
  relationships: z.array(ExtractedRelationshipSchema).default([]),
  facts: z.array(ExtractedFactSchema).default([]),
  actions: z.array(ExtractedActionSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export const SEMANTIC_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entities", "relationships", "facts"],
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["temporaryId", "type", "name", "confidence"],
        properties: {
          temporaryId: { type: "string" },
          type: { type: "string" },
          name: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          description: { type: "string" },
          attributes: { type: "object" },
          confidence: { type: "number" },
        },
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "type", "target", "confidence"],
        properties: {
          source: { type: "string" },
          type: { type: "string" },
          target: { type: "string" },
          confidence: { type: "number" },
          evidence: { type: "string" },
          attributes: { type: "object" },
        },
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["predicate", "confidence"],
        properties: {
          subject: { type: "string" },
          predicate: { type: "string" },
          valueText: { type: "string" },
          valueNumber: { type: "number" },
          valueDate: { type: "string" },
          valueJson: { type: "object" },
          confidence: { type: "number" },
          evidence: { type: "string" },
        },
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "description", "confidence"],
        properties: {
          type: { type: "string" },
          description: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

function normalizeRelationshipType(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizePredicate(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Validate and normalize LLM extraction output.
 * Drops unsupported entity types and low-signal noise.
 */
export function parseSemanticExtraction(
  value: unknown
): SemanticExtractionResult | null {
  const parsed = SemanticExtractionSchema.safeParse(value);
  if (!parsed.success) return null;

  const warnings = [...parsed.data.warnings];
  const entityIds = new Set<string>();

  const entities = parsed.data.entities
    .map((e) => {
      const type = e.type.trim().toLowerCase();
      const name = e.name.trim();
      if (!name || e.confidence < 0.3) return null;
      if (!ENTITY_TYPE_SET.has(type)) {
        warnings.push(`Dropped unsupported entity type: ${type}`);
        return null;
      }
      if (/^(document|page|file|item|thing|stuff)$/i.test(name)) return null;
      entityIds.add(e.temporaryId);
      return {
        temporaryId: e.temporaryId,
        type,
        name,
        aliases: e.aliases?.map((a) => a.trim()).filter(Boolean),
        description: e.description?.trim(),
        attributes: e.attributes,
        confidence: e.confidence,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const relationships = parsed.data.relationships
    .map((r) => {
      const type = normalizeRelationshipType(r.type);
      if (!RELATIONSHIP_TYPE_SET.has(type)) {
        warnings.push(`Dropped unsupported relationship type: ${r.type}`);
        return null;
      }
      if (r.confidence < 0.3) return null;
      if (!entityIds.has(r.source) || !entityIds.has(r.target)) return null;
      if (r.source === r.target) return null;
      return {
        source: r.source,
        type,
        target: r.target,
        confidence: r.confidence,
        evidence: r.evidence?.trim(),
        attributes: r.attributes,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const facts = parsed.data.facts
    .map((f) => {
      const predicate = normalizePredicate(f.predicate);
      if (!predicate || f.confidence < 0.3) return null;
      if (f.subject && !entityIds.has(f.subject)) return null;

      let valueNumber = f.valueNumber;
      let valueText = f.valueText?.trim();
      let valueDate = f.valueDate ? normalizeDateValue(f.valueDate) : undefined;

      if (
        valueNumber == null &&
        valueText &&
        (predicate === "amount" || /\$|usd|dollar/i.test(valueText))
      ) {
        const amount = normalizeDollarAmount(valueText);
        if (amount != null) {
          valueNumber = amount;
          valueText = undefined;
        }
      }

      if (!valueDate && valueText && predicate.includes("date")) {
        valueDate = normalizeDateValue(valueText) ?? undefined;
      }

      return {
        subject: f.subject,
        predicate,
        valueText,
        valueNumber,
        valueDate: valueDate ?? undefined,
        valueJson: f.valueJson,
        confidence: f.confidence,
        evidence: f.evidence?.trim(),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  return {
    entities,
    relationships,
    facts,
    actions: parsed.data.actions,
    warnings,
  };
}
