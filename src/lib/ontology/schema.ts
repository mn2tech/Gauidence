import {
  DEFAULT_RELATIONSHIP_MIN_CONFIDENCE,
  ONTOLOGY_ENTITY_TYPES,
  RELATED_TO_MIN_CONFIDENCE,
  RELATED_TO_MIN_EVIDENCE_CHARS,
  normalizeRelationshipType,
} from "./types";
import type { OntologyExtractionResult } from "./types";

const ENTITY_TYPES = new Set<string>(ONTOLOGY_ENTITY_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntity(value: unknown): OntologyExtractionResult["entities"][number] | null {
  if (!isRecord(value)) return null;
  const type = typeof value.type === "string" ? value.type.trim().toLowerCase() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const confidence =
    typeof value.confidence === "number" ? value.confidence : 0.5;

  if (!type || !name || confidence < 0.3) return null;
  if (!ENTITY_TYPES.has(type) && type !== "client") return null;

  const aliases = Array.isArray(value.aliases)
    ? value.aliases
        .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        .map((a) => a.trim())
    : undefined;

  const description =
    typeof value.description === "string" ? value.description.trim() : undefined;

  let attributes: Record<string, unknown> | undefined;
  if (isRecord(value.attributes)) {
    attributes = value.attributes;
  } else if (isRecord(value.properties)) {
    attributes = value.properties;
  }

  return { type, name, aliases, description, attributes, confidence };
}

function parseRelationship(
  value: unknown
): OntologyExtractionResult["relationships"][number] | null {
  if (!isRecord(value)) return null;
  const source = typeof value.source === "string" ? value.source.trim() : "";
  const target = typeof value.target === "string" ? value.target.trim() : "";
  const rawType = typeof value.type === "string" ? value.type.trim() : "";
  const type = normalizeRelationshipType(rawType);
  const evidence =
    typeof value.evidence === "string" ? value.evidence.trim() : "";
  const confidence =
    typeof value.confidence === "number" ? value.confidence : 0.5;

  if (!source || !target || !type) return null;
  if (!evidence) return null;
  if (source.toLowerCase() === target.toLowerCase()) return null;

  if (type === "RELATED_TO") {
    if (confidence < RELATED_TO_MIN_CONFIDENCE) return null;
    if (evidence.length < RELATED_TO_MIN_EVIDENCE_CHARS) return null;
  } else if (confidence < DEFAULT_RELATIONSHIP_MIN_CONFIDENCE) {
    return null;
  }

  return { source, type, target, evidence, confidence };
}

function parseEvent(value: unknown): OntologyExtractionResult["events"][number] | null {
  if (!isRecord(value)) return null;
  const type = typeof value.type === "string" ? value.type.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!type || !title) return null;

  return {
    type,
    title,
    eventDate:
      typeof value.eventDate === "string" ? value.eventDate : undefined,
    confidence:
      typeof value.confidence === "number" ? value.confidence : undefined,
  };
}

export function parseOntologyExtraction(value: unknown): OntologyExtractionResult | null {
  if (!isRecord(value)) return null;

  const entities = Array.isArray(value.entities)
    ? value.entities
        .map(parseEntity)
        .filter((e): e is NonNullable<typeof e> => e !== null)
    : [];

  const relationships = Array.isArray(value.relationships)
    ? value.relationships
        .map(parseRelationship)
        .filter((r): r is NonNullable<typeof r> => r !== null)
    : [];

  const events = Array.isArray(value.events)
    ? value.events
        .map(parseEvent)
        .filter((e): e is NonNullable<typeof e> => e !== null)
    : [];

  if (!entities.length && !relationships.length) return null;

  return { entities, relationships, events };
}

export const ONTOLOGY_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          name: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          description: { type: "string" },
          attributes: { type: "object", additionalProperties: true },
          confidence: { type: "number" },
        },
        required: ["type", "name", "confidence"],
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string" },
          type: { type: "string" },
          target: { type: "string" },
          confidence: { type: "number" },
          evidence: { type: "string" },
        },
        required: ["source", "type", "target", "confidence", "evidence"],
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          eventDate: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["type", "title"],
      },
    },
  },
  required: ["entities", "relationships", "events"],
} as const;
