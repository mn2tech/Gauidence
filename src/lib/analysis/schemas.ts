/** Shared JSON-schema fragments for specialist Claude responses. */

export const EXTRACTED_FACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    value: { type: "string" },
    source_type: {
      type: "string",
      enum: ["document", "calculated", "ai_suggestion", "user_confirmed"],
    },
    confidence: { type: "number" },
    source_excerpt: { type: "string" },
    page_number: { type: ["number", "null"] },
    needs_verification: { type: "boolean" },
    date: { type: ["string", "null"] },
    is_deadline: { type: "boolean" },
    is_past_event: { type: "boolean" },
  },
  required: [
    "label",
    "value",
    "source_type",
    "confidence",
    "source_excerpt",
    "page_number",
    "needs_verification",
    "date",
    "is_deadline",
    "is_past_event",
  ],
} as const;

export const BASE_ANALYSIS_PROPERTIES = {
  document_type: { type: "string" },
  title: { type: "string" },
  summary: { type: "string" },
  facts: { type: "array", items: EXTRACTED_FACT_SCHEMA },
  important_dates: { type: "array", items: EXTRACTED_FACT_SCHEMA },
  people: { type: "array", items: { type: "string" } },
  organizations: { type: "array", items: { type: "string" } },
  amounts: { type: "array", items: EXTRACTED_FACT_SCHEMA },
  obligations: { type: "array", items: { type: "string" } },
  warnings: { type: "array", items: { type: "string" } },
  suggested_actions: { type: "array", items: { type: "string" } },
  overall_confidence: { type: "number" },
} as const;

export const BASE_REQUIRED = [
  "document_type",
  "title",
  "summary",
  "facts",
  "important_dates",
  "people",
  "organizations",
  "amounts",
  "obligations",
  "warnings",
  "suggested_actions",
  "overall_confidence",
] as const;
