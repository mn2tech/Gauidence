import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  wantsVaultFileInventory,
  formatVaultFileSummaryForGideon,
} from "../askInventory.ts";

describe("wantsVaultFileInventory", () => {
  it("detects listing and counting questions", () => {
    assert.equal(wantsVaultFileInventory("what files are uploaded"), true);
    assert.equal(wantsVaultFileInventory("list all documents"), true);
    assert.equal(wantsVaultFileInventory("how many photos do I have"), true);
    assert.equal(wantsVaultFileInventory("what is in the vault"), true);
  });

  it("does not trigger for normal content questions", () => {
    assert.equal(wantsVaultFileInventory("what does the invoice say"), false);
    assert.equal(wantsVaultFileInventory("show me Jane Doe payroll"), false);
    assert.equal(wantsVaultFileInventory("when is the renewal due"), false);
    assert.equal(
      wantsVaultFileInventory("What dates are in Rising_203rd_20Summer_20Packet_.pdf?"),
      false
    );
    assert.equal(wantsVaultFileInventory("What PDFs are in this space?"), false);
  });
});

describe("formatVaultFileSummaryForGideon", () => {
  it("shows recent files and total counts without full inventory", () => {
    const summary = formatVaultFileSummaryForGideon(
      [
        { file_name: "a.pdf", profile_id: "p1" },
        { file_name: "b.pdf", profile_id: "p1" },
      ],
      { p1: "NM2TECH" },
      { p1: 42 }
    );
    assert.match(summary, /42 file/);
    assert.match(summary, /a\.pdf/);
    assert.match(summary, /Summary only/);
  });
});
