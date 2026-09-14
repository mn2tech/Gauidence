import type { GuardianExtractedItem } from "@/lib/guardian-items/schema";

export type GmailMoneySignalKind =
  | "receipt"
  | "bill"
  | "subscription"
  | "renewal"
  | "return_deadline"
  | "price_increase";

export type GmailMoneySignal = {
  kind: GmailMoneySignalKind;
  merchant: string;
  amountCents: number | null;
  previousAmountCents: number | null;
  dueDate: string | null;
  cadence: "monthly" | "annual" | null;
  potentialAnnualSavingsCents: number | null;
  confidence: number;
  reason: string;
};

export type MoneyEmailInput = {
  fromName: string;
  fromEmail: string;
  subject: string;
  preview: string;
  receivedAt: string | null;
};

const MONEY_WORDS =
  /\b(receipt|order|purchase|charged|payment|amount due|bill|statement|invoice|subscription|membership|renew(?:al|s|ing)?|auto-?renew|return by|refund|price increase|rate increase|new price)\b/i;

function moneyToCents(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

function amountsFromText(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g)) {
    const cents = moneyToCents(match[1] ?? "");
    if (cents != null) out.push(cents);
  }
  return out;
}

function labelledAmount(text: string): number | null {
  const match = text.match(
    /\b(?:amount due|total|charged|payment|renew(?:al)?(?: price)?|new (?:price|rate))\b[^$0-9]{0,24}\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i
  );
  return match ? moneyToCents(match[1] ?? "") : null;
}

function isoDate(raw: string, receivedAt: string | null): string | null {
  const reference = receivedAt ? new Date(receivedAt) : new Date();
  const numeric = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    let year = numeric[3] ? Number(numeric[3]) : reference.getUTCFullYear();
    if (year < 100) year += 2000;
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, "0")}-${month
        .toString()
        .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    }
  }

  const named = raw.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i
  );
  if (!named) return null;
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const month = months.indexOf(named[1]!.toLowerCase()) + 1;
  const day = Number(named[2]);
  const year = Number(named[3] ?? reference.getUTCFullYear());
  if (!month || day < 1 || day > 31) return null;
  return `${year}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function dateAfter(text: string, words: RegExp, receivedAt: string | null): string | null {
  const matches = text.matchAll(new RegExp(`${words.source}[^\\n.]{0,60}`, "gi"));
  for (const match of matches) {
    const parsed = isoDate(match[0], receivedAt);
    if (parsed) return parsed;
  }
  return null;
}

function merchantName(input: MoneyEmailInput): string {
  const name = input.fromName.trim();
  if (name && name.toLowerCase() !== input.fromEmail.toLowerCase()) return name;
  return input.fromEmail.split("@")[1]?.split(".")[0] || "this service";
}

/** Deterministic, evidence-only money signal detection from Gmail metadata. */
export function analyzeMoneyEmail(input: MoneyEmailInput): GmailMoneySignal | null {
  const text = `${input.subject}\n${input.preview}`.trim();
  if (!MONEY_WORDS.test(text)) return null;

  const merchant = merchantName(input);
  const cadence = /\bmonthly|per month\b/i.test(text)
    ? "monthly"
    : /\bannual(?:ly)?|yearly|per year\b/i.test(text)
      ? "annual"
      : null;
  const returnDate = dateAfter(
    text,
    /\b(?:return by|return window (?:ends|closes)|refund (?:by|before|expires?))\b/i,
    input.receivedAt
  );
  const renewalDate = dateAfter(
    text,
    /\b(?:renews?|renewal|auto-?renew(?:s|al)?)\b/i,
    input.receivedAt
  );
  const paymentDue = dateAfter(
    text,
    /\b(?:due|pay by|payment due)\b/i,
    input.receivedAt
  );
  const amounts = amountsFromText(text);
  const amountCents = labelledAmount(text) ?? amounts[0] ?? null;
  const explicitIncrease = text.match(
    /\b(?:price|rate|bill|subscription)?\s*(?:is |has |will )?(?:increased?|changing)\b[^$]{0,40}\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)[^$]{0,30}\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i
  );
  const fromTo = text.match(
    /\bfrom\s+\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s+to\s+\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i
  );
  const increase = fromTo ?? explicitIncrease;
  if (increase) {
    const previous = moneyToCents(increase[1] ?? "");
    const current = moneyToCents(increase[2] ?? "");
    if (previous != null && current != null && current > previous) {
      const delta = current - previous;
      return {
        kind: "price_increase",
        merchant,
        amountCents: current,
        previousAmountCents: previous,
        dueDate: null,
        cadence,
        potentialAnnualSavingsCents:
          cadence === "monthly" ? delta * 12 : cadence === "annual" ? delta : null,
        confidence: 0.97,
        reason: `Price changed from $${(previous / 100).toFixed(2)} to $${(current / 100).toFixed(2)}.`,
      };
    }
  }

  if (returnDate) {
    return {
      kind: "return_deadline", merchant, amountCents, previousAmountCents: null,
      dueDate: returnDate, cadence: null, potentialAnnualSavingsCents: null,
      confidence: 0.95, reason: `Return or refund deadline found for ${returnDate}.`,
    };
  }
  if (/\b(?:subscription|membership|auto-?renew|renewal|renews?)\b/i.test(text)) {
    return {
      kind: renewalDate ? "renewal" : "subscription", merchant, amountCents,
      previousAmountCents: null, dueDate: renewalDate, cadence,
      potentialAnnualSavingsCents: null, confidence: renewalDate ? 0.94 : 0.84,
      reason: renewalDate ? `Renewal date found for ${renewalDate}.` : "Recurring charge language found.",
    };
  }
  if (/\b(?:amount due|bill|statement|invoice|payment due|pay by)\b/i.test(text)) {
    return {
      kind: "bill", merchant, amountCents, previousAmountCents: null,
      dueDate: paymentDue, cadence, potentialAnnualSavingsCents: null,
      confidence: paymentDue ? 0.93 : 0.82,
      reason: paymentDue ? `Payment due date found for ${paymentDue}.` : "Bill or payment language found.",
    };
  }
  if (/\b(?:receipt|order|purchase|charged|payment confirmation)\b/i.test(text)) {
    return {
      kind: "receipt", merchant, amountCents, previousAmountCents: null,
      dueDate: null, cadence: null, potentialAnnualSavingsCents: null,
      confidence: 0.86, reason: "Purchase or receipt language found.",
    };
  }
  return null;
}

/** Confirm an increase by comparing the same sender's current and prior charge. */
export function compareWithPreviousCharge(
  current: GmailMoneySignal,
  previous: GmailMoneySignal | null
): GmailMoneySignal {
  if (
    current.kind === "price_increase" ||
    !current.amountCents ||
    !previous?.amountCents ||
    current.amountCents <= previous.amountCents
  ) return current;
  if (!["bill", "subscription", "renewal"].includes(current.kind)) return current;
  if (!["bill", "subscription", "renewal"].includes(previous.kind)) return current;
  const delta = current.amountCents - previous.amountCents;
  if (delta < 100 || delta / previous.amountCents < 0.03) return current;
  return {
    ...current,
    kind: "price_increase",
    previousAmountCents: previous.amountCents,
    potentialAnnualSavingsCents:
      current.cadence === "monthly" ? delta * 12 : current.cadence === "annual" ? delta : null,
    confidence: 0.92,
    reason: `Charge increased from $${(previous.amountCents / 100).toFixed(2)} to $${(current.amountCents / 100).toFixed(2)}.`,
  };
}

export function moneySignalToGuardianItem(
  signal: GmailMoneySignal,
  sourceExcerpt: string
): GuardianExtractedItem | null {
  const actionable =
    signal.kind === "price_increase" ||
    signal.kind === "return_deadline" ||
    ((signal.kind === "renewal" || signal.kind === "bill") && Boolean(signal.dueDate));
  if (!actionable) return null;
  const type = signal.kind === "return_deadline"
    ? "return_window"
    : signal.kind === "renewal"
      ? "renewal"
      : signal.kind === "bill"
        ? "payment"
        : "task";
  const title = signal.kind === "price_increase"
    ? `Review ${signal.merchant} price increase`
    : signal.kind === "return_deadline"
      ? `${signal.merchant} return deadline`
      : signal.kind === "renewal"
        ? `${signal.merchant} renewal`
        : `${signal.merchant} payment due`;
  return {
    type,
    title,
    description: signal.reason,
    event_date: signal.dueDate,
    due_at: signal.dueDate,
    requires_action: true,
    priority: signal.kind === "price_increase" ? "normal" : "high",
    confidence: signal.confidence,
    source_excerpt: sourceExcerpt.slice(0, 500),
    metadata: { money_guardian: signal },
  };
}
