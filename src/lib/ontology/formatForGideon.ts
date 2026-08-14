import type { OntologyContext, OntologyEntity } from "./types";
import { readContentTranscript } from "./pipeline/enrichWithTranscript";

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
    blocks.push("INVOICE SUMMARY (answer the user from this first; list each invoice, then TOTAL):");
    for (const invoice of invoices.slice(0, 12)) {
      blocks.push(`- ${formatInvoiceProse(invoice, ctx)}`);
    }
    const total = sumInvoiceAmounts(invoices);
    if (total) {
      blocks.push(
        `- TOTAL: ${formatMoney(total.amount, total.currency)} across ${total.count} invoice${total.count === 1 ? "" : "s"} with known amounts`
      );
    } else {
      blocks.push(
        "- TOTAL: unknown (invoice amounts were not stored as structured attributes yet)"
      );
    }
  }

  if (ctx.matchedEntities.length > 0) {
    if (invoices.length) blocks.push("");
    blocks.push("MATCHED ENTITIES:");
    // Keep prompt compact: prefer invoices/orgs/people over duplicate events.
    const entities = rankEntitiesForPrompt(ctx.matchedEntities);
    const entityLimit =
      entities.length > 12 ? Math.min(entities.length, 40) : invoices.length > 1 ? 12 : 5;
    for (const entity of entities.slice(0, entityLimit)) {
      const conf =
        entity.confidence != null
          ? ` | confidence:${Number(entity.confidence).toFixed(2)}`
          : "";
      const descLimit =
        entity.entity_type === "document" || readContentTranscript(entity.properties)
          ? 600
          : 160;
      const desc = entity.description
        ? ` — ${entity.description.slice(0, descLimit)}`
        : "";
      const attrs = formatEntityAttributes(
        entity.properties,
        entity.description,
        entity.name
      );
      blocks.push(
        `- ${entity.name} (${entity.entity_type})${desc}${attrs}${conf}`
      );
    }

    const contentBlocks = entities
      .map((entity) => {
        const transcript = readContentTranscript(entity.properties);
        if (!transcript) return null;
        return `CONNECTED FILE CONTENT (${entity.name}):\n${transcript.slice(0, 3000)}`;
      })
      .filter((b): b is string => Boolean(b));
    if (contentBlocks.length) {
      blocks.push("", ...contentBlocks.slice(0, 2));
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
      const connectorNote =
        ev.source_type === "connector"
          ? " [connected source — user can Open file from citations]"
          : "";
      blocks.push(`- "${text}"${connectorNote}`);
    }
  }

  return blocks.filter((b, i) => !(b === "" && blocks[i - 1] === "")).join("\n") || "(none)";
}

function formatEntityAttributes(
  properties: Record<string, unknown> | null | undefined,
  description?: string | null,
  name?: string | null
): string {
  const facts = readInvoiceFacts(properties, description, name);
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
    const totalLine = invoiceSummaries.find((s) => /^TOTAL:/i.test(s));
    const rows = invoiceSummaries.filter((s) => !/^TOTAL:/i.test(s));
    for (const summary of rows.slice(0, 12)) {
      parts.push(`- ${summary.replace(/^- /, "")}`);
    }
    if (totalLine) {
      parts.push("");
      parts.push(totalLine.replace(/^- /, ""));
    } else {
      const computed = sumAmountsFromTextLines(rows);
      if (computed) {
        parts.push("");
        parts.push(
          `TOTAL: ${formatMoney(computed.amount, computed.currency)} across ${computed.count} invoice${computed.count === 1 ? "" : "s"} with known amounts`
        );
      }
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
    parts.push("");
    parts.push(
      "Ask a follow-up if you want more detail from the source file."
    );
  }

  return parts.join("\n");
}

type InvoiceFacts = {
  amountLabel: string | null;
  amountValue: number | null;
  currency: string;
  invoiceNumber: string | null;
  issuer: string | null;
  recipient: string | null;
  invoiceDate: string | null;
};

function readInvoiceFacts(
  properties: Record<string, unknown> | null | undefined,
  description?: string | null,
  name?: string | null
): InvoiceFacts {
  const empty: InvoiceFacts = {
    amountLabel: null,
    amountValue: null,
    currency: "USD",
    invoiceNumber: null,
    issuer: null,
    recipient: null,
    invoiceDate: null,
  };

  const props =
    properties && typeof properties === "object" ? properties : {};
  const currency =
    typeof props.currency === "string" && props.currency.trim()
      ? props.currency.trim()
      : "USD";

  let amountValue: number | null = null;
  const amount = props.amount ?? props.total ?? props.invoice_amount;
  if (typeof amount === "number" && Number.isFinite(amount)) {
    amountValue = amount;
  } else if (typeof amount === "string" && amount.trim()) {
    const parsed = parseMoneyNumber(amount);
    if (parsed != null) amountValue = parsed;
  }
  if (amountValue == null && description) {
    amountValue = parseMoneyNumber(description);
  }
  if (amountValue == null && name) {
    amountValue = parseMoneyNumber(name);
  }

  const amountLabel =
    amountValue != null ? formatMoney(amountValue, currency) : null;

  const invoiceNumberRaw =
    props.invoice_number ?? props.invoiceNumber ?? props.number;
  let invoiceNumber =
    typeof invoiceNumberRaw === "string" && invoiceNumberRaw.trim()
      ? invoiceNumberRaw.trim()
      : typeof invoiceNumberRaw === "number"
        ? String(invoiceNumberRaw)
        : null;
  if (!invoiceNumber) {
    const fromName = name?.match(/\binvoice\s*#?\s*([0-9]{3,})\b/i)?.[1];
    const fromDesc = description?.match(/\binvoice\s*#?\s*([0-9]{3,})\b/i)?.[1];
    invoiceNumber = fromName ?? fromDesc ?? null;
  }

  const issuerRaw = props.issuer ?? props.from;
  const recipientRaw = props.recipient ?? props.to;
  const dateRaw = props.invoice_date ?? props.date ?? props.issued_on;

  let issuer =
    typeof issuerRaw === "string" && issuerRaw.trim()
      ? issuerRaw.trim()
      : null;
  let recipient =
    typeof recipientRaw === "string" && recipientRaw.trim()
      ? recipientRaw.trim()
      : null;
  if (description) {
    if (!issuer) {
      const m = description.match(/\b(?:from|issued by)\s+([^,]+?)(?:\s+to\b|,|$)/i);
      if (m?.[1]) issuer = m[1].trim();
    }
    if (!recipient) {
      const m = description.match(/\bto\s+([^,]+?)(?:\s+for\b|,|$)/i);
      if (m?.[1]) recipient = m[1].trim();
    }
  }

  return {
    amountLabel,
    amountValue,
    currency,
    invoiceNumber,
    issuer,
    recipient,
    invoiceDate:
      typeof dateRaw === "string" && dateRaw.trim() ? dateRaw.trim() : null,
  };
}

function parseMoneyNumber(text: string): number | null {
  const match =
    text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/) ||
    text.match(/([\d,]+(?:\.\d{1,2})?)\s*USD\b/i) ||
    text.match(/\btotal(?:ing)?\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match?.[1]) return null;
  const parsed = Number.parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(amount: number, currency = "USD"): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function pickInvoiceEntities(entities: OntologyEntity[]): OntologyEntity[] {
  const candidates = entities.filter((e) => {
    if (/\breceipt\b/i.test(e.name)) return false;
    if (e.entity_type === "invoice") return true;
    if (e.entity_type === "purchase" && /\binvoice\b/i.test(e.name)) return true;
    return hasInvoiceSignals(e) && /\binvoice\b/i.test(e.name);
  });
  return dedupeInvoiceEntities(candidates);
}

function dedupeInvoiceEntities(entities: OntologyEntity[]): OntologyEntity[] {
  const byKey = new Map<string, OntologyEntity>();
  const score = (e: OntologyEntity) => {
    let s = 0;
    if (e.entity_type === "invoice") s += 10;
    if (/^invoice\b/i.test(e.name)) s += 5;
    if (e.properties && Object.keys(e.properties).length) s += 2;
    return s;
  };
  for (const entity of entities) {
    const facts = readInvoiceFacts(entity.properties, entity.description, entity.name);
    const key =
      (facts.invoiceNumber ? `num:${facts.invoiceNumber}` : null) ||
      (facts.amountValue != null
        ? `amt:${facts.amountValue}:${(facts.issuer ?? "").toLowerCase()}`
        : `id:${entity.id}`);
    const existing = byKey.get(key);
    if (!existing || score(entity) > score(existing)) {
      byKey.set(key, entity);
    }
  }
  return [...byKey.values()];
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
    const facts = readInvoiceFacts(
      invoice.properties,
      invoice.description,
      invoice.name
    );
    if (facts.amountValue == null) continue;
    sum += facts.amountValue;
    count += 1;
    currency = facts.currency || currency;
  }
  if (!count) return null;
  return { amount: sum, currency, count };
}

function sumAmountsFromTextLines(lines: string[]): {
  amount: number;
  currency: string;
  count: number;
} | null {
  let sum = 0;
  let count = 0;
  for (const line of lines) {
    const value = parseMoneyNumber(line);
    if (value == null) continue;
    sum += value;
    count += 1;
  }
  if (!count) return null;
  return { amount: sum, currency: "USD", count };
}

function hasInvoiceSignals(entity: OntologyEntity): boolean {
  const facts = readInvoiceFacts(
    entity.properties,
    entity.description,
    entity.name
  );
  if (facts.amountLabel || facts.invoiceNumber) return true;
  return /\binvoice\b/i.test(entity.name) && entity.entity_type !== "organization";
}

function formatInvoiceProse(
  invoice: OntologyEntity,
  ctx: OntologyContext
): string {
  const facts = readInvoiceFacts(
    invoice.properties,
    invoice.description,
    invoice.name
  );
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

  // Prefer compact structured line; only append description when it adds new detail.
  const prose = bits.join(" ");
  const desc = invoice.description?.trim();
  if (
    desc &&
    !facts.amountLabel &&
    !prose.toLowerCase().includes(desc.slice(0, 24).toLowerCase())
  ) {
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
