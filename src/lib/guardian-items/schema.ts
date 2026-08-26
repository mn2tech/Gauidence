import { z } from "zod";
import { GUARDIAN_ITEM_PRIORITIES, GUARDIAN_ITEM_TYPES } from "./types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .nullable()
  .optional();

export const guardianExtractedItemSchema = z.object({
  type: z.enum(GUARDIAN_ITEM_TYPES),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(1000).nullable().optional(),
  event_date: isoDate,
  due_at: isoDate,
  requires_action: z.boolean(),
  priority: z.enum(GUARDIAN_ITEM_PRIORITIES).default("normal"),
  child_reference: z.string().trim().max(200).nullable().optional(),
  confidence: z.number().min(0).max(1),
  source_excerpt: z.string().trim().min(1).max(500),
});

export const guardianExtractionSchema = z.object({
  items: z.array(guardianExtractedItemSchema).max(40),
});

export type GuardianExtractedItem = z.infer<typeof guardianExtractedItemSchema>;
export type GuardianExtractionResult = z.infer<typeof guardianExtractionSchema>;

export function parseGuardianExtraction(
  raw: unknown
): GuardianExtractionResult | null {
  const result = guardianExtractionSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** JSON schema for Claude structured output. */
export const GUARDIAN_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          event_date: { type: ["string", "null"] },
          due_at: { type: ["string", "null"] },
          requires_action: { type: "boolean" },
          priority: { type: "string" },
          child_reference: { type: ["string", "null"] },
          confidence: { type: "number" },
          source_excerpt: { type: "string" },
        },
        required: [
          "type",
          "title",
          "requires_action",
          "confidence",
          "source_excerpt",
        ],
      },
    },
  },
  required: ["items"],
} as const;
