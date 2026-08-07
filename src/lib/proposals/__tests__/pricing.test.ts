import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateProposalPricing, formatMoney } from "../pricing.ts";

describe("calculateProposalPricing", () => {
  it("sums line items and addons with tax", () => {
    const pricing = calculateProposalPricing({
      lineItems: [
        {
          id: "1",
          title: "Design",
          quantity: 10,
          unitLabel: "hours",
          unitPriceCents: 15000,
        },
      ],
      addons: [
        {
          id: "2",
          title: "Rush fee",
          quantity: 1,
          unitLabel: "each",
          unitPriceCents: 50000,
          optional: true,
        },
      ],
      taxRateBps: 800,
      selectedAddonIds: new Set(["2"]),
    });
    assert.equal(pricing.subtotalCents, 200000);
    assert.equal(pricing.taxCents, 16000);
    assert.equal(pricing.totalCents, 216000);
  });
});

describe("formatMoney", () => {
  it("formats USD cents", () => {
    assert.match(formatMoney(125000), /\$1,250\.00/);
  });
});
