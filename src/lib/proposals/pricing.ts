import type { ProposalLineItem } from "./types";

export type ProposalPricing = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

function lineTotalCents(item: ProposalLineItem): number {
  return Math.round(item.quantity * item.unitPriceCents);
}

/** Compute subtotal, tax, and total from line items and add-ons. */
export function calculateProposalPricing(args: {
  lineItems: ProposalLineItem[];
  addons: ProposalLineItem[];
  taxRateBps: number;
  selectedAddonIds?: Set<string>;
}): ProposalPricing {
  const { lineItems, addons, taxRateBps, selectedAddonIds } = args;
  const baseSubtotal = lineItems.reduce((sum, item) => sum + lineTotalCents(item), 0);
  const addonSubtotal = addons
    .filter((item) => !item.optional || selectedAddonIds?.has(item.id))
    .reduce((sum, item) => sum + lineTotalCents(item), 0);
  const subtotalCents = baseSubtotal + addonSubtotal;
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
