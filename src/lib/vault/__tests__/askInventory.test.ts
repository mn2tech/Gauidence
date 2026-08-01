import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAskVaultInventory, formatVaultFileListForGideon } from "../askInventory.ts";

describe("ask vault inventory", () => {
  it("splits photos from documents and previews names", () => {
    const inv = buildAskVaultInventory(
      [
        { file_name: "lease.pdf", mime_type: "application/pdf" },
        { file_name: "passport.jpg", mime_type: "image/jpeg" },
        { file_name: "scan.PNG", mime_type: null },
        { file_name: "invoice.pdf", mime_type: "application/pdf" },
      ],
      [
        {
          title: "School pickup",
          log_date: "2026-07-16",
          content: "Picked up early",
        },
        {
          title: null,
          log_date: "2026-07-15",
          content: "Paid the water bill online this morning",
        },
      ]
    );

    assert.equal(inv.documentCount, 2);
    assert.equal(inv.photoCount, 2);
    assert.equal(inv.logCount, 2);
    assert.deepEqual(inv.documentNames, ["lease.pdf", "invoice.pdf"]);
    assert.deepEqual(inv.photoNames, ["passport.jpg", "scan.PNG"]);
    assert.equal(inv.logNames[0], "School pickup");
    assert.match(inv.logNames[1]!, /2026-07-15/);
  });

  it("formats per-vault file lists for Gideon", () => {
    const text = formatVaultFileListForGideon(
      [
        {
          file_name: "lease.pdf",
          mime_type: "application/pdf",
          profile_id: "vault-a",
        },
        {
          file_name: "logo.png",
          mime_type: "image/png",
          profile_id: "vault-a",
        },
        {
          file_name: "invoice.pdf",
          mime_type: "application/pdf",
          profile_id: "vault-b",
        },
      ],
      { "vault-a": "Acme Client", "vault-b": "NM2TECH" }
    );
    assert.match(text, /Acme Client/);
    assert.match(text, /Documents \(1\): lease\.pdf/);
    assert.match(text, /Photos \(1\): logo\.png/);
    assert.match(text, /NM2TECH/);
    assert.match(text, /invoice\.pdf/);
  });
});
