import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  proposalExportFilename,
  proposalExportHeaders,
} from "../export.ts";

describe("proposalExportFilename", () => {
  it("sanitizes titles for a downloadable HTML file", () => {
    assert.equal(
      proposalExportFilename("Proxdose — Homepage Sprint"),
      "Proxdose_Homepage_Sprint.html"
    );
  });

  it("falls back when the title has no usable characters", () => {
    assert.equal(proposalExportFilename("???"), "proposal.html");
  });
});

describe("proposalExportHeaders", () => {
  it("forces a file download", () => {
    const headers = proposalExportHeaders("Client Proposal");
    assert.equal(headers["Content-Type"], "text/html; charset=utf-8");
    assert.match(headers["Content-Disposition"] ?? "", /^attachment;/);
    assert.match(headers["Content-Disposition"] ?? "", /Client_Proposal\.html/);
  });
});
