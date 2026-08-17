import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  proposalExportFilename,
  proposalExportHeaders,
  type ProposalExportData,
} from "../export.ts";
import { generateProposalPdf } from "../exportPdf.ts";
import type { Proposal } from "../types.ts";

describe("proposalExportFilename", () => {
  it("sanitizes titles for a downloadable PDF file", () => {
    assert.equal(
      proposalExportFilename("Proxdose — Homepage Sprint"),
      "Proxdose_Homepage_Sprint.pdf"
    );
  });

  it("falls back when the title has no usable characters", () => {
    assert.equal(proposalExportFilename("???"), "proposal.pdf");
  });
});

describe("proposalExportHeaders", () => {
  it("forces a PDF file download", () => {
    const headers = proposalExportHeaders("Client Proposal");
    assert.equal(headers["Content-Type"], "application/pdf");
    assert.match(headers["Content-Disposition"] ?? "", /^attachment;/);
    assert.match(headers["Content-Disposition"] ?? "", /Client_Proposal\.pdf/);
  });
});

function sampleExport(): ProposalExportData {
  const proposal: Proposal = {
    id: "p1",
    business_profile_id: "b1",
    client_profile_id: "c1",
    created_by: "u1",
    template_id: null,
    title: "Homepage Sprint",
    summary: "A two-week homepage redesign.",
    introduction: "This proposal covers design and launch.",
    terms: "Net 15.",
    status: "sent",
    version: 1,
    currency: "USD",
    tax_rate_bps: 0,
    subtotal_cents: 450000,
    tax_cents: 0,
    total_cents: 450000,
    line_items: [
      {
        id: "1",
        title: "Homepage redesign",
        description: "Wireframes, UI, and launch support.",
        quantity: 1,
        unitLabel: "project",
        unitPriceCents: 450000,
      },
    ],
    timeline: [
      {
        id: "t1",
        title: "Kickoff",
        description: "Align on goals",
        sortOrder: 0,
      },
    ],
    deliverables: [
      {
        id: "d1",
        title: "Live homepage",
        description: "Deployed to production",
        sortOrder: 0,
      },
    ],
    addons: [
      {
        id: "a1",
        title: "Rush delivery",
        quantity: 1,
        unitLabel: "each",
        unitPriceCents: 50000,
        optional: true,
      },
    ],
    expires_at: null,
    sent_at: null,
    first_viewed_at: null,
    last_viewed_at: null,
    accepted_at: null,
    declined_at: null,
    client_feedback: null,
    document_id: null,
    work_project_id: null,
    portal_token_hash: null,
    portal_token_expires_at: null,
    external_metadata: {},
    created_at: "2026-08-17T00:00:00.000Z",
    updated_at: "2026-08-17T00:00:00.000Z",
  };
  return {
    proposal,
    businessName: "Guardian Studio",
    clientName: "Proxdose",
  };
}

describe("generateProposalPdf", () => {
  it("returns a PDF document", async () => {
    const pdf = await generateProposalPdf(sampleExport());
    assert.ok(pdf.length > 200);
    assert.equal(pdf.subarray(0, 4).toString("latin1"), "%PDF");
  });
});
