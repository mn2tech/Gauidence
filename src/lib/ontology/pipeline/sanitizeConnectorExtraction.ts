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
  const attrs = { ...(entity.attributes ?? {}) };
  const description = entity.description ?? "";

  // Backfill structured money/invoice fields from description when missing.
  if (!hasMoneyAttr(attrs) && description) {
    const money = description.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
    if (money?.[1]) {
      const amount = Number.parseFloat(money[1].replace(/,/g, ""));
      if (Number.isFinite(amount)) {
        attrs.amount = amount;
        if (typeof attrs.currency !== "string") attrs.currency = "USD";
      }
    }
  }
  if (!hasInvoiceNumberAttr(attrs)) {
    const num =
      entity.name.match(/\binvoice\s*#?\s*([0-9]{3,})\b/i)?.[1] ||
      description.match(/\binvoice\s*#?\s*([0-9]{3,})\b/i)?.[1];
    if (num) attrs.invoice_number = num;
  }

  const withAttrs = { ...entity, attributes: attrs };
  const looksInvoice =
    withAttrs.type === "invoice" ||
    withAttrs.type === "purchase" ||
    hasMoneyAttr(attrs) ||
    hasInvoiceNumberAttr(attrs) ||
    /\binvoice\s*#?\s*\d+/i.test(withAttrs.name) ||
    (/^invoice\b/i.test(withAttrs.name) && withAttrs.type === "organization");

  if (!looksInvoice) return withAttrs;

  // Never keep invoice titles as organizations.
  if (
    withAttrs.type === "organization" ||
    withAttrs.type === "event" ||
    withAttrs.type === "document"
  ) {
    if (
      /\binvoice\b/i.test(withAttrs.name) ||
      hasMoneyAttr(attrs) ||
      hasInvoiceNumberAttr(attrs)
    ) {
      return { ...withAttrs, type: "invoice" };
    }
  }

  if (
    withAttrs.type !== "invoice" &&
    withAttrs.type !== "purchase" &&
    hasMoneyAttr(attrs)
  ) {
    return { ...withAttrs, type: "invoice" };
  }

  return withAttrs;
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
