import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PAID_ASSESSMENT_PRICE_CENTS,
  buildClientReadyProposalContent,
} from "../proposalFromAssessment.ts";
import type { BusinessAssessmentDetail } from "../types.ts";

const baseDetail: BusinessAssessmentDetail = {
  id: "a1",
  business_profile_id: "biz-1",
  client_profile_id: "client-1",
  created_by: "user-1",
  company_name: "Proxdose",
  website_url: "https://proxdose.com",
  industry: "general",
  status: "complete",
  executive_summary: "Your site has strong foundations but trust gaps are costing inquiries.",
  report_json: {},
  error_message: null,
  analyzed_at: "2026-01-01T00:00:00Z",
  proposal_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  findings: [
    {
      id: "f1",
      assessment_id: "a1",
      analyzer: "website",
      category: "trust",
      severity: "high",
      title: "No visible customer testimonials",
      description: "Buyers need social proof before reaching out.",
      business_impact: "Increase buyer trust",
      recommendation: "Add 2–3 client testimonials with logos",
      raw_data: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  opportunities: [],
  solutions: [
    {
      id: "s1",
      assessment_id: "a1",
      service_key: "seo_optimization",
      title: "SEO Program",
      description: "SEO work",
      reason: null,
      business_value: null,
      estimated_roi: null,
      implementation_time: "24 hours",
      price_cents: 300000,
      hours: 24,
      sort_order: 0,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  outcomes: [
    {
      id: "o1",
      assessment_id: "a1",
      outcome_text: "Increase website-driven inquiries",
      measurable_metric: "15–25%",
      sort_order: 0,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

describe("buildClientReadyProposalContent", () => {
  it("leads with the $99 assessment line item", () => {
    const draft = buildClientReadyProposalContent(baseDetail);
    assert.equal(draft.lineItems[0]?.title, "Website & Conversion Assessment");
    assert.equal(draft.lineItems[0]?.unitPriceCents, PAID_ASSESSMENT_PRICE_CENTS);
  });

  it("consolidates implementation into one client-facing package", () => {
    const draft = buildClientReadyProposalContent(baseDetail);
    assert.equal(draft.lineItems.length, 2);
    assert.match(draft.lineItems[1]?.title ?? "", /Trust & Conversion/i);
    assert.match(draft.lineItems[1]?.description ?? "", /testimonials/i);
  });

  it("maps findings to deliverables", () => {
    const draft = buildClientReadyProposalContent(baseDetail);
    assert.ok(draft.deliverables.length >= 2);
    assert.ok(
      draft.deliverables.some((d) =>
        /testimonial/i.test(`${d.title} ${d.description ?? ""}`)
      )
    );
  });

  it("mentions credit terms", () => {
    const draft = buildClientReadyProposalContent(baseDetail);
    assert.match(draft.terms, /\$99/i);
    assert.match(draft.terms, /credited/i);
  });
});
