import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRegulatoryDisclosureFileName } from "../../gideon/documentGrounding.ts";

describe("regulatory disclosure file matching", () => {
  it("matches IAPD brochure ids and Form ADV titles", () => {
    assert.equal(isRegulatoryDisclosureFileName("1026427.pdf"), true);
    assert.equal(
      isRegulatoryDisclosureFileName(
        "Form ADV Part 2A - Firm Disclosure Brochure - Kendall Capital Management, Inc..pdf"
      ),
      true
    );
  });
});
