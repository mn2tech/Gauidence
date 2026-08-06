import { z } from "zod";
import { KNOWLEDGE_ENTITY_TYPES, KNOWLEDGE_PREDICATES } from "./types";

const entityTypeSchema = z.enum(KNOWLEDGE_ENTITY_TYPES);
const predicateSchema = z.union([
  z.enum(KNOWLEDGE_PREDICATES),
  z.string().min(1).max(64),
]);

export const knowledgeExtractionSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        entityType: entityTypeSchema,
        aliases: z.array(z.string().min(1).max(200)).max(8).optional(),
        confidence: z.number().min(0).max(1),
        sourceExcerpt: z.string().max(500).optional(),
      })
    )
    .max(40),
  facts: z
    .array(
      z.object({
        subject: z.string().min(1).max(200),
        subjectType: entityTypeSchema.optional(),
        predicate: predicateSchema,
        object: z.string().max(200).optional(),
        objectType: entityTypeSchema.optional(),
        value: z.string().max(500).optional(),
        valueType: z.string().max(64).optional(),
        unit: z.string().max(32).optional(),
        effectiveDate: z.string().max(32).optional(),
        expirationDate: z.string().max(32).optional(),
        confidence: z.number().min(0).max(1),
        sourceExcerpt: z.string().min(1).max(500),
      })
    )
    .max(60),
  relationships: z
    .array(
      z.object({
        subject: z.string().min(1).max(200),
        relationship: z.string().min(1).max(64),
        object: z.string().min(1).max(200),
        confidence: z.number().min(0).max(1),
        sourceExcerpt: z.string().max(500).optional(),
      })
    )
    .max(40),
});

export type ValidatedKnowledgeExtraction = z.infer<
  typeof knowledgeExtractionSchema
>;

export function parseKnowledgeExtraction(
  raw: unknown
): ValidatedKnowledgeExtraction | null {
  const result = knowledgeExtractionSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** JSON schema for Claude structured output. */
export const KNOWLEDGE_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          entityType: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          sourceExcerpt: { type: "string" },
        },
        required: ["name", "entityType", "confidence"],
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          subject: { type: "string" },
          subjectType: { type: "string" },
          predicate: { type: "string" },
          object: { type: "string" },
          objectType: { type: "string" },
          value: { type: "string" },
          valueType: { type: "string" },
          unit: { type: "string" },
          effectiveDate: { type: "string" },
          expirationDate: { type: "string" },
          confidence: { type: "number" },
          sourceExcerpt: { type: "string" },
        },
        required: ["subject", "predicate", "confidence", "sourceExcerpt"],
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          subject: { type: "string" },
          relationship: { type: "string" },
          object: { type: "string" },
          confidence: { type: "number" },
          sourceExcerpt: { type: "string" },
        },
        required: ["subject", "relationship", "object", "confidence"],
      },
    },
  },
  required: ["entities", "facts", "relationships"],
} as const;
