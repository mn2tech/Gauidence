import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAskVaultInventory } from "../askInventory.ts";

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
});
