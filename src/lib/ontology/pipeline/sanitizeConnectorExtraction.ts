import type { OntologyExtractionResult } from "../types";
import { looksLikeInfraOrFolderLabel } from "../formatForGideon";

/**
 * Post-process connector LLM extractions before persist.
 * Fixes common invoice graph noise without requiring another LLM call.
 */
export function sanitizeConnectorOntologyExtraction(
  extraction: OntologyExtractionResult
): OntologyExtractionResult {
  const entities = extraction.entities
    .map(coerceEntity)
    .filter((e) => !isJunkEntity(e));

  const entityByName = new Map(
    entities.map((e) => [e.name.trim().toLowerCase(), e] as const)
  );
  const hasInvoiceEntity = entities.some(
    (e) => e.type === "invoice" || e.type === "purchase"
  );

  const relationships = extraction.relationships
    .map((rel) => normalizeInvoiceEdge(rel, entityByName))
    .filter((rel): rel is NonNullable<typeof rel> => rel != null)
    .filter((rel) => !isJunkRelationship(rel, entityByName));

  const events = hasInvoiceEntity
    ? extraction.events.filter((ev) => !/\binvoice\b/i.test(ev.title))
    : extraction.events;

  return { entities, relationships, events };
}

function coerceEntity(
  entity: OntologyExtractionResult["entities"][number]
): OntologyExtractionResult["entities"][number] {
  const attrs = entity.attributes ?? {};
  const looksInvoice =
    entity.type === "invoice" ||
    entity.type === "purchase" ||
    hasMoneyAttr(attrs) ||
    hasInvoiceNumberAttr(attrs) ||
    /\binvoice\s*#?\s*\d+/i.test(entity.name) ||
    (/^invoice\b/i.test(entity.name) && entity.type === "organization");

  if (!looksInvoice) return entity;

  // Never keep invoice titles as organizations.
  if (
    entity.type === "organization" ||
    entity.type === "event" ||
    entity.type === "document"
  ) {
    if (
      /\binvoice\b/i.test(entity.name) ||
      hasMoneyAttr(attrs) ||
      hasInvoiceNumberAttr(attrs)
    ) {
      return { ...entity, type: "invoice" };
    }
  }

  if (entity.type !== "invoice" && entity.type !== "purchase" && hasMoneyAttr(attrs)) {
    return { ...entity, type: "invoice" };
  }

  return entity;
}

function isJunkEntity(
  entity: OntologyExtractionResult["entities"][number]
): boolean {
  const name = entity.name.trim();
  if (!name) return true;
  if (/^invoice$/i.test(name) && entity.type === "organization") return true;
  if (looksLikeInfraOrFolderLabel(name) && entity.type === "organization") {
    return true;
  }
  return false;
}

function normalizeInvoiceEdge(
  rel: OntologyExtractionResult["relationships"][number],
  entityByName: Map<string, OntologyExtractionResult["entities"][number]>
): OntologyExtractionResult["relationships"][number] | null {
  const source = entityByName.get(rel.source.trim().toLowerCase());
  const target = entityByName.get(rel.target.trim().toLowerCase());
  const sourceIsInvoice =
    source?.type === "invoice" ||
    source?.type === "purchase" ||
    looksLikeInvoiceName(rel.source);
  const targetIsInvoice =
    target?.type === "invoice" ||
    target?.type === "purchase" ||
    looksLikeInvoiceName(rel.target);
  const sourceIsOrg =
    source?.type === "organization" || looksLikeOrgName(rel.source);
  const targetIsOrg =
    target?.type === "organization" || looksLikeOrgName(rel.target);

  // Invoice ← ISSUED_BY ← Org  ⇒  Invoice —ISSUED_BY→ Org
  if (
    rel.type === "ISSUED_BY" &&
    targetIsInvoice &&
    sourceIsOrg &&
    !sourceIsInvoice
  ) {
    return {
      ...rel,
      source: rel.target,
      target: rel.source,
    };
  }

  // Org —ISSUED_TO→ Invoice  ⇒  Invoice —ISSUED_TO→ Org
  if (
    rel.type === "ISSUED_TO" &&
    sourceIsOrg &&
    targetIsInvoice &&
    !sourceIsInvoice
  ) {
    return {
      ...rel,
      source: rel.target,
      target: rel.source,
    };
  }

  return rel;
}

function isJunkRelationship(
  rel: OntologyExtractionResult["relationships"][number],
  entityByName: Map<string, OntologyExtractionResult["entities"][number]>
): boolean {
  if (looksLikeInfraOrFolderLabel(rel.source) || looksLikeInfraOrFolderLabel(rel.target)) {
    if (
      rel.type === "PURCHASED_FROM" ||
      rel.type === "EVIDENCED_BY" ||
      rel.type === "RELATED_TO"
    ) {
      return true;
    }
  }

  const source = entityByName.get(rel.source.trim().toLowerCase());
  const target = entityByName.get(rel.target.trim().toLowerCase());
  if (
    rel.type === "RELATED_TO" &&
    (source?.type === "invoice" ||
      target?.type === "invoice" ||
      looksLikeInvoiceName(rel.source) ||
      looksLikeInvoiceName(rel.target))
  ) {
    // Prefer ISSUED_* edges for invoices; drop vague RELATED_TO.
    return true;
  }

  return false;
}

function hasMoneyAttr(attrs: Record<string, unknown>): boolean {
  const amount = attrs.amount ?? attrs.total ?? attrs.invoice_amount;
  return (
    (typeof amount === "number" && Number.isFinite(amount)) ||
    (typeof amount === "string" && amount.trim().length > 0)
  );
}

function hasInvoiceNumberAttr(attrs: Record<string, unknown>): boolean {
  const n = attrs.invoice_number ?? attrs.invoiceNumber ?? attrs.number;
  return (
    (typeof n === "string" && n.trim().length > 0) || typeof n === "number"
  );
}

function looksLikeInvoiceName(name: string): boolean {
  return /\binvoice\b/i.test(name);
}

function looksLikeOrgName(name: string): boolean {
  return /\b(llc|inc|corp|ltd|company|technologies|tech)\b/i.test(name);
}
