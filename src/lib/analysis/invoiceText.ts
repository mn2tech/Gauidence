/**
 * Deterministic labeled-field parsing from invoice document text.
 * Used after native/OCR extraction — never hardcodes fixture values.
 */

export type ParsedInvoiceLine = {
  contractor: string;
  description: string;
  hours: number | null;
  rate: number | null;
  amount: number | null;
};

export type ParsedInvoiceAnchors = {
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  issuer: string | null;
  billed_to: string | null;
  subtotal: number | null;
  total_amount_due: number | null;
  line_items: ParsedInvoiceLine[];
  explicit_due_date: boolean;
  explicit_invoice_date: boolean;
};

function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseIsoOrUsDate(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3];
    // Prefer MDY for US invoices when ambiguous
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const named = t.match(
    /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})$/i
  );
  if (named) {
    const months: Record<string, string> = {
      jan: "01",
      january: "01",
      feb: "02",
      february: "02",
      mar: "03",
      march: "03",
      apr: "04",
      april: "04",
      may: "05",
      jun: "06",
      june: "06",
      jul: "07",
      july: "07",
      aug: "08",
      august: "08",
      sep: "09",
      september: "09",
      oct: "10",
      october: "10",
      nov: "11",
      november: "11",
      dec: "12",
      december: "12",
    };
    const mon = months[named[1].toLowerCase()];
    if (mon) {
      return `${named[3]}-${mon}-${String(named[2]).padStart(2, "0")}`;
    }
  }
  return null;
}

function labeledValue(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function parseLineRow(line: string): ParsedInvoiceLine | null {
  const t = line.trim();
  if (
    !t ||
    /subtotal|total\s*due|^total\b|invoice|bill\s*to|contractor|hours|rate|amount|^\s*date\b|^\s*due\b/i.test(
      t
    )
  ) {
    return null;
  }

  if (t.includes("|")) {
    const cols = t.split("|").map((c) => c.trim());
    if (cols.length >= 4) {
      const contractor = cols[0];
      const description = cols.length >= 5 ? cols[1] : "";
      const hours = parseMoney(cols[cols.length - 3] ?? "");
      const rate = parseMoney(cols[cols.length - 2] ?? "");
      const amount = parseMoney(cols[cols.length - 1] ?? "");
      if (
        contractor &&
        looksLikePersonOrService(contractor) &&
        hours != null &&
        hours <= 10000 &&
        (rate != null || amount != null)
      ) {
        return { contractor, description, hours, rate, amount };
      }
    }
  }

  // Name … hours rate amount (last three numeric tokens)
  const moneyLike =
    t.match(/\$?\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\$?\d+(?:\.\d{2})?/g) ?? [];
  if (moneyLike.length >= 2) {
    const amount = parseMoney(moneyLike[moneyLike.length - 1]!);
    const rate = parseMoney(moneyLike[moneyLike.length - 2]!);
    const hours =
      moneyLike.length >= 3
        ? parseMoney(moneyLike[moneyLike.length - 3]!)
        : null;
    const namePart = t
      .slice(0, t.indexOf(moneyLike[0]!))
      .replace(/[|•·]+/g, " ")
      .trim();
    const contractor = namePart.replace(/\s{2,}/g, " ").trim();
    if (
      contractor &&
      looksLikePersonOrService(contractor) &&
      hours != null &&
      hours <= 10000
    ) {
      return { contractor, description: "", hours, rate, amount };
    }
  }
  return null;
}

function looksLikePersonOrService(name: string): boolean {
  const n = name.trim();
  if (!n || /^(date|due|from|to|invoice|total|subtotal)\b/i.test(n)) return false;
  if (!/[A-Za-z]{2,}/.test(n)) return false;
  // Reject pure date fragments
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) return false;
  return true;
}

/** Parse invoice anchors from native/OCR text. Returns nulls when not found. */
export function parseInvoiceFromText(text: string): ParsedInvoiceAnchors {
  const invoice_number = labeledValue(text, [
    /Invoice\s*(?:#|No\.?|Number|ID)\s*[:.]?\s*(#[0-9A-Za-z\-]+|\d{4,})/i,
    /Invoice\s*#\s*([0-9A-Za-z\-]+)/i,
  ]);
  let inv = invoice_number;
  if (inv && /^\d+$/.test(inv) && inv.length >= 4) inv = `#${inv}`;
  if (inv && /^0+\d+$/.test(inv)) inv = `#${inv}`;

  const invoiceDateRaw = labeledValue(text, [
    /(?:^|\n)\s*(?:Invoice\s*)?Date\s*[:.]?\s*([^\n]+)/i,
  ]);
  const dueDateRaw = labeledValue(text, [
    /(?:^|\n)\s*Due(?:\s*Date)?\s*[:.]?\s*([^\n]+)/i,
  ]);

  const invoice_date = invoiceDateRaw ? parseIsoOrUsDate(invoiceDateRaw) : null;
  const due_date = dueDateRaw ? parseIsoOrUsDate(dueDateRaw) : null;

  const billed_to = labeledValue(text, [
    /Bill(?:ed)?\s*To\s*[:.]?\s*\n?\s*([^\n]+)/i,
  ]);

  const issuer =
    labeledValue(text, [/From\s*[:.]?\s*([^\n]+)/i]) ??
    (text.match(/^\s*([A-Z0-9][A-Z0-9 &.,'-]{2,}(?:LLC|Inc|Corp)?)\s*$/m)?.[1] ??
      null);

  const subtotalRaw = labeledValue(text, [/Subtotal\s*[:.]?\s*\$?\s*([\d,]+\.?\d*)/i]);
  const totalRaw = labeledValue(text, [
    /Total\s*(?:Amount\s*)?Due\s*[:.]?\s*\$?\s*([\d,]+\.?\d*)/i,
    /(?:^|\n)\s*Total\s*[:.]?\s*\$?\s*([\d,]+\.?\d*)/i,
  ]);

  const line_items: ParsedInvoiceLine[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseLineRow(line);
    if (row) line_items.push(row);
  }

  return {
    invoice_number: inv,
    invoice_date,
    due_date,
    issuer: issuer?.trim() || null,
    billed_to: billed_to?.trim() || null,
    subtotal: subtotalRaw ? parseMoney(subtotalRaw) : null,
    total_amount_due: totalRaw ? parseMoney(totalRaw) : null,
    line_items,
    explicit_due_date: Boolean(due_date),
    explicit_invoice_date: Boolean(invoice_date),
  };
}
