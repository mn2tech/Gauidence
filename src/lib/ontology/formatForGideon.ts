import type { OntologyContext, OntologyEntity } from "./types";

/**
 * Compact one-hop ontology block for Gideon's system prompt.
 * Returns "(none)" when empty so the prompt section stays stable.
 */
export function formatOntologyForGideon(ctx: OntologyContext): string {
  if (
    ctx.matchedEntities.length === 0 &&
    ctx.relationships.length === 0 &&
    ctx.evidence.length === 0 &&
    ctx.paths.length === 0
  ) {
    return "(none)";
  }

  const nameOf = (id: string) => ctx.entityNames[id] ?? "Unknown entity";
  const invoices = pickInvoiceEntities(ctx.matchedEntities);
  const blocks: string[] = [];

  if (invoices.length > 0) {
    blocks.push("INVOICE SUMMARY (answer the user from this first; do not dump the graph):");
    for (const invoice of invoices.slice(0, 12)) {
      blocks.push(`- ${formatInvoiceProse(invoice, ctx)}`);
    }
    const total = sumInvoiceAmounts(invoices);
    if (total) {
      blocks.push(
        `- TOTAL: ${total.currency} ${total.amount.toLocaleString("en-US", {
          minimumFractionDigits: total.amount % 1 === 0 ? 0 : 2,
          maximumFractionDigits: 2,
        })} across ${total.count} invoice${total.count === 1 ? "" : "s"} with known amounts`
      );
    }
  }

  if (ctx.matchedEntities.length > 0) {
    if (invoices.length) blocks.push("");
    blocks.push("MATCHED ENTITIES:");
    // Keep prompt compact: prefer invoices/orgs/people over duplicate events.
    const entities = rankEntitiesForPrompt(ctx.matchedEntities);
    for (const entity of entities.slice(0, invoices.length > 1 ? 12 : 5)) {
      const conf =
        entity.confidence != null
          ? ` | confidence:${Number(entity.confidence).toFixed(2)}`
          : "";
      const desc = entity.description
        ? ` — ${entity.description.slice(0, 160)}`
        : "";
      const attrs = formatEntityAttributes(entity.properties);
      blocks.push(
        `- ${entity.name} (${entity.entity_type})${desc}${attrs}${conf}`
      );
    }
  }

  const relationships = rankRelationshipsForPrompt(ctx);
  if (relationships.length > 0) {
    blocks.push("", "RELATIONSHIPS (one-hop):");
    for (const rel of relationships.slice(0, 8)) {
      const conf =
        rel.confidence != null
          ? ` | confidence:${Number(rel.confidence).toFixed(2)}`
          : "";
      blocks.push(
        `- ${nameOf(rel.source_entity_id)} —[${rel.relationship_type}]→ ${nameOf(rel.target_entity_id)}${conf}`
      );
    }
  }

  if (ctx.paths.length > 0) {
    blocks.push("", "PATHS (up to 2-hop):");
    for (const path of ctx.paths.slice(0, 4)) {
      blocks.push(`- ${path.label}`);
    }
  }

  if (ctx.evidence.length > 0) {
    blocks.push("", "EVIDENCE (cite when using ontology facts):");
    for (const ev of ctx.evidence.slice(0, 5)) {
      const text = (ev.evidence_text ?? "").trim().slice(0, 120);
      if (!text) continue;
      blocks.push(`- "${text}"`);
    }
  }

  return blocks.filter((b, i) => !(b === "" && blocks[i - 1] === "")).join("\n") || "(none)";
}

function formatEntityAttributes(
  properties: Record<string, unknown> | null | undefined
): string {
  if (!properties || typeof properties !== "object") return "";
  const facts = readInvoiceFacts(properties);
  const parts: string[] = [];
  if (facts.amountLabel) parts.push(`amount:${facts.amountLabel}`);
  if (facts.invoiceNumber) parts.push(`invoice_number:${facts.invoiceNumber}`);
  if (facts.issuer) parts.push(`issuer:${facts.issuer}`);
  if (facts.recipient) parts.push(`recipient:${facts.recipient}`);
  if (facts.invoiceDate) parts.push(`invoice_date:${facts.invoiceDate}`);
  if (!parts.length) return "";
  return ` | ${parts.join("; ")}`;
}

/**
 * User-facing answer when the LLM returns blank but ontology matched.
 */
export function buildOntologyAnswerFallback(ontologyBlock: string): string | null {
  const trimmed = ontologyBlock.trim();
  if (!trimmed || trimmed === "(none)") return null;

  const invoiceSummaries: string[] = [];
  const entityLines: string[] = [];
  const relationshipLines: string[] = [];
  let section:
    | "none"
    | "invoice_summary"
    | "entities"
    | "relationships"
    | "paths"
    | "evidence" = "none";

  for (const raw of trimmed.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("INVOICE SUMMARY")) {
      section = "invoice_summary";
      continue;
    }
    if (line.startsWith("MATCHED ENTITIES")) {
      section = "entities";
      continue;
    }
    if (line.startsWith("RELATIONSHIPS")) {
      section = "relationships";
      continue;
    }
    if (line.startsWith("PATHS")) {
      section = "paths";
      continue;
    }
    if (line.startsWith("EVIDENCE")) {
      section = "evidence";
      continue;
    }
    if (line.startsWith("TOTAL:")) {
      invoiceSummaries.push(line);
      continue;
    }
    if (!line.startsWith("- ")) continue;
    const item = line.slice(2).trim();
    if (section === "invoice_summary") {
      if (item) invoiceSummaries.push(item);
    } else if (section === "entities") {
      const name = item.replace(/\s*\|.*$/, "").trim();
      if (name && !isNoisyEntityLine(name)) entityLines.push(name);
    } else if (section === "relationships" || section === "paths") {
      const clean = item.replace(/\s*\|.*$/, "").trim();
      if (clean && isUsefulConnectionLine(clean)) {
        relationshipLines.push(clean);
      }
    }
  }

  if (
    !invoiceSummaries.length &&
    !entityLines.length &&
    !relationshipLines.length
  ) {
    return null;
  }

  const parts: string[] = ["## FROM YOUR ONTOLOGY", ""];

  if (invoiceSummaries.length) {
    for (const summary of invoiceSummaries.slice(0, 12)) {
      parts.push(summary.startsWith("TOTAL:") ? summary : `- ${summary}`);
    }
    // If TOTAL wasn't already in the block, leave as-is; summaries may include it.
    if (relationshipLines.length && invoiceSummaries.length <= 3) {
      parts.push("");
      parts.push("Key connections:");
      for (const r of relationshipLines.slice(0, 4)) parts.push(`- ${r}`);
    }
  } else {
    if (entityLines.length) {
      parts.push("Matching entities:");
      for (const e of entityLines.slice(0, 5)) parts.push(`- ${e}`);
    }
    if (relationshipLines.length) {
      if (entityLines.length) parts.push("");
      parts.push("Connections:");
      for (const r of relationshipLines.slice(0, 6)) parts.push(`- ${r}`);
    }
  }

  parts.push("");
  parts.push(
    "Ask a follow-up if you want more detail from the source file."
  );
  return parts.join("\n");
}

type InvoiceFacts = {
  amountLabel: string | null;
  invoiceNumber: string | null;
  issuer: string | null;
  recipient: string | null;
  invoiceDate: string | null;
};

function readInvoiceFacts(
  properties: Record<string, unknown> | null | undefined
): InvoiceFacts {
  const empty: InvoiceFacts = {
    amountLabel: null,
    invoiceNumber: null,
    issuer: null,
    recipient: null,
    invoiceDate: null,
  };
  if (!properties || typeof properties !== "object") return empty;

  const amount = properties.amount ?? properties.total ?? properties.invoice_amount;
  const currency =
    typeof properties.currency === "string" && properties.currency.trim()
      ? properties.currency.trim()
      : "USD";
  let amountLabel: string | null = null;
  if (typeof amount === "number" && Number.isFinite(amount)) {
    amountLabel = `${currency} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  } else if (typeof amount === "string" && amount.trim()) {
    amountLabel = amount.trim();
  }

  const invoiceNumberRaw =
    properties.invoice_number ?? properties.invoiceNumber ?? properties.number;
  const invoiceNumber =
    typeof invoiceNumberRaw === "string" && invoiceNumberRaw.trim()
      ? invoiceNumberRaw.trim()
      : typeof invoiceNumberRaw === "number"
        ? String(invoiceNumberRaw)
        : null;

  const issuerRaw = properties.issuer ?? properties.from;
  const recipientRaw = properties.recipient ?? properties.to;
  const dateRaw =
    properties.invoice_date ?? properties.date ?? properties.issued_on;

  return {
    amountLabel,
    invoiceNumber,
    issuer:
      typeof issuerRaw === "string" && issuerRaw.trim()
        ? issuerRaw.trim()
        : null,
    recipient:
      typeof recipientRaw === "string" && recipientRaw.trim()
        ? recipientRaw.trim()
        : null,
    invoiceDate:
      typeof dateRaw === "string" && dateRaw.trim() ? dateRaw.trim() : null,
  };
}

function pickInvoiceEntities(entities: OntologyEntity[]): OntologyEntity[] {
  return entities.filter(
    (e) =>
      e.entity_type === "invoice" ||
      e.entity_type === "purchase" ||
      hasInvoiceSignals(e)
  );
}

function sumInvoiceAmounts(invoices: OntologyEntity[]): {
  amount: number;
  currency: string;
  count: number;
} | null {
  let sum = 0;
  let count = 0;
  let currency = "USD";
  for (const invoice of invoices) {
    const props = invoice.properties ?? {};
    const amount = props.amount ?? props.total ?? props.invoice_amount;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      sum += amount;
      count += 1;
      if (typeof props.currency === "string" && props.currency.trim()) {
        currency = props.currency.trim();
      }
    } else if (typeof amount === "string") {
      const parsed = Number.parseFloat(amount.replace(/[,$]/g, ""));
      if (Number.isFinite(parsed)) {
        sum += parsed;
        count += 1;
      }
    }
  }
  if (!count) return null;
  return { amount: sum, currency, count };
}

function hasInvoiceSignals(entity: OntologyEntity): boolean {
  const facts = readInvoiceFacts(entity.properties);
  if (facts.amountLabel || facts.invoiceNumber) return true;
  return /\binvoice\b/i.test(entity.name) && entity.entity_type !== "organization";
}

function formatInvoiceProse(
  invoice: OntologyEntity,
  ctx: OntologyContext
): string {
  const facts = readInvoiceFacts(invoice.properties);
  const issuer =
    facts.issuer ??
    findRelatedName(ctx, invoice.id, "ISSUED_BY") ??
    null;
  const recipient =
    facts.recipient ??
    findRelatedName(ctx, invoice.id, "ISSUED_TO") ??
    null;

  const bits: string[] = [];
  if (facts.invoiceNumber) {
    bits.push(`Invoice #${facts.invoiceNumber}`);
  } else if (invoice.name.trim()) {
    bits.push(invoice.name.trim());
  } else {
    bits.push("Invoice");
  }
  if (facts.amountLabel) bits.push(`for ${facts.amountLabel}`);
  if (issuer) bits.push(`from ${issuer}`);
  if (recipient) bits.push(`to ${recipient}`);
  if (facts.invoiceDate) bits.push(`dated ${facts.invoiceDate}`);

  const desc = invoice.description?.trim();
  const prose = bits.join(" ");
  if (desc && !prose.toLowerCase().includes(desc.slice(0, 24).toLowerCase())) {
    return `${prose}. ${desc.slice(0, 160)}`;
  }
  return prose;
}

function findRelatedName(
  ctx: OntologyContext,
  invoiceId: string,
  relationshipType: string
): string | null {
  for (const rel of ctx.relationships) {
    if (rel.relationship_type !== relationshipType) continue;
    if (rel.source_entity_id === invoiceId) {
      return ctx.entityNames[rel.target_entity_id] ?? null;
    }
    // Tolerate inverted edges in stored data.
    if (rel.target_entity_id === invoiceId) {
      return ctx.entityNames[rel.source_entity_id] ?? null;
    }
  }
  return null;
}

function rankEntitiesForPrompt(entities: OntologyEntity[]): OntologyEntity[] {
  const score = (e: OntologyEntity) => {
    if (e.entity_type === "invoice" || e.entity_type === "purchase") return 100;
    if (e.entity_type === "organization" || e.entity_type === "person") return 80;
    if (e.entity_type === "document" || e.entity_type === "contract") return 60;
    if (e.entity_type === "event" && /\binvoice\b/i.test(e.name)) return 10;
    if (isGenericInvoiceOrg(e)) return 5;
    return 40;
  };
  return [...entities].sort((a, b) => score(b) - score(a));
}

function isGenericInvoiceOrg(entity: OntologyEntity): boolean {
  return (
    entity.entity_type === "organization" &&
    /^invoice$/i.test(entity.name.trim())
  );
}

function rankRelationshipsForPrompt(ctx: OntologyContext) {
  const preferred = new Set([
    "ISSUED_BY",
    "ISSUED_TO",
    "HAS_INVOICE",
    "CLIENT_OF",
    "VENDOR_OF",
    "WORKS_FOR",
    "SUBCONTRACTOR_TO",
  ]);
  const noisyTarget = (id: string) => {
    const name = (ctx.entityNames[id] ?? "").toLowerCase();
    return looksLikeInfraOrFolderLabel(name);
  };

  return [...ctx.relationships]
    .filter((rel) => {
      if (rel.relationship_type === "RELATED_TO") return false;
      if (
        (rel.relationship_type === "PURCHASED_FROM" ||
          rel.relationship_type === "EVIDENCED_BY") &&
        (noisyTarget(rel.target_entity_id) || noisyTarget(rel.source_entity_id))
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const as = preferred.has(a.relationship_type) ? 1 : 0;
      const bs = preferred.has(b.relationship_type) ? 1 : 0;
      return bs - as;
    });
}

function isNoisyEntityLine(line: string): boolean {
  const lower = line.toLowerCase();
  if (/^invoice \(organization\)/.test(lower)) return true;
  if (/\(event\)/.test(lower) && /\binvoice\b/.test(lower)) return true;
  return false;
}

function isUsefulConnectionLine(line: string): boolean {
  const upper = line.toUpperCase();
  if (upper.includes("[RELATED_TO]")) return false;
  if (
    (upper.includes("[PURCHASED_FROM]") || upper.includes("[EVIDENCED_BY]")) &&
    looksLikeInfraOrFolderLabel(line)
  ) {
    return false;
  }
  return true;
}

export function looksLikeInfraOrFolderLabel(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(database|postgres|aurora|supporting databases|downloads|documents|desktop|excel|xlsx|sheet)\b/.test(
      lower
    ) || /[/\\]/.test(text)
  );
}
