import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyProposalTemplate,
  proposalTemplateTotalCents,
} from "../templateApply.ts";
import type { ProposalTemplate } from "../types.ts";

const sampleTemplate: ProposalTemplate = {
  id: "tpl-1",
  business_profile_id: "biz-1",
  created_by: "user-1",
  name: "Website & Conversion Assessment",
  description: "Assessment package",
  default_title: "{{company_name}} — Assessment",
  default_summary: "Review for {{website_url}}",
  default_introduction: "Hello {{client_name}}",
  default_terms: "$99 credited within 30 days.",
  default_line_items: [
    {
      id: "li-1",
      title: "Assessment",
      description: "Walkthrough included",
      quantity: 1,
      unitLabel: "assessment",
      unitPriceCents: 9900,
    },
  ],
  default_timeline: [],
  default_deliverables: [],
  default_addons: [],
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("applyProposalTemplate", () => {
  it("personalizes placeholders and clones line item ids", () => {
    const applied = applyProposalTemplate(sampleTemplate, {
      company_name: "Proxdose",
      website_url: "https://proxdose.com",
      client_name: "Alex",
    });
    assert.match(applied.title, /Proxdose/);
    assert.match(applied.summary, /proxdose\.com/);
    assert.match(applied.introduction, /Alex/);
    assert.notEqual(applied.lineItems[0]?.id, "li-1");
    assert.equal(applied.lineItems[0]?.unitPriceCents, 9900);
  });
});

describe("proposalTemplateTotalCents", () => {
  it("sums line item totals", () => {
    assert.equal(proposalTemplateTotalCents(sampleTemplate), 9900);
  });
});
