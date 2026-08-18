import type { VisionResult } from "./types";

export const VISION_RESULT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    document_type: { type: "string" },
    description: { type: "string" },
    transcription: { type: "string" },
    summary: { type: "string" },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          name: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["type", "name", "confidence"],
      },
    },
    dates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "string" },
          context: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["value", "context", "confidence"],
      },
    },
    amounts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "number" },
          currency: { type: "string" },
          context: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["value", "currency", "context", "confidence"],
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          predicate: { type: "string" },
          subject: { type: "string" },
          object: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["predicate", "subject", "object", "confidence"],
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["text", "confidence"],
      },
    },
    confidence: { type: "number" },
  },
  required: [
    "document_type",
    "description",
    "transcription",
    "summary",
    "entities",
    "dates",
    "amounts",
    "facts",
    "tasks",
    "confidence",
  ],
} as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampConfidence(value: unknown): number {
  return Math.max(0, Math.min(1, asNumber(value, 0)));
}

/** Parse model JSON into a VisionResult. Unknown/invalid fields stay empty. */
export function parseVisionResult(raw: unknown): VisionResult {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const entities = Array.isArray(obj.entities)
    ? obj.entities
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const name = asString(item.name);
          const type = asString(item.type) || "unknown";
          if (!name) return null;
          return {
            type,
            name,
            confidence: clampConfidence(item.confidence ?? 0.5),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
    : [];

  const dates = Array.isArray(obj.dates)
    ? obj.dates
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const value = asString(item.value);
          if (!value) return null;
          return {
            value,
            context: asString(item.context),
            confidence: clampConfidence(item.confidence ?? 0.5),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
    : [];

  const amounts = Array.isArray(obj.amounts)
    ? obj.amounts
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const value =
            item.value == null || item.value === ""
              ? null
              : asNumber(item.value, Number.NaN);
          if (value != null && !Number.isFinite(value)) return null;
          const context = asString(item.context);
          if (value == null && !context) return null;
          return {
            value: value == null || !Number.isFinite(value) ? null : value,
            currency: asString(item.currency) || null,
            context,
            confidence: clampConfidence(item.confidence ?? 0.5),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
    : [];

  const facts = Array.isArray(obj.facts)
    ? obj.facts
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const predicate = asString(item.predicate);
          const subject = asString(item.subject);
          const object = asString(item.object);
          if (!predicate || !subject || !object) return null;
          return {
            predicate,
            subject,
            object,
            confidence: clampConfidence(item.confidence ?? 0.5),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
    : [];

  const tasks = Array.isArray(obj.tasks)
    ? obj.tasks
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const text = asString(item.text);
          if (!text) return null;
          return {
            text,
            confidence: clampConfidence(item.confidence ?? 0.5),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
    : [];

  return {
    document_type: asString(obj.document_type) || "unknown",
    description: asString(obj.description),
    transcription: asString(obj.transcription),
    summary: asString(obj.summary),
    entities,
    dates,
    amounts,
    facts,
    tasks,
    confidence: clampConfidence(obj.confidence ?? 0),
  };
}
