import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expandDocumentContentRetrievalQuery,
  filterUnavailableGapsAgainstSpaceDocs,
  isDocumentContentQuestion,
  isRegulatoryDisclosureFileName,
} from "../documentGrounding.ts";

describe("documentGrounding", () => {
  it("detects fee and disclosure questions", () => {
    assert.equal(isDocumentContentQuestion("How are fees described?"), true);
    assert.equal(isDocumentContentQuestion("What services are described?"), true);
    assert.equal(isDocumentContentQuestion("What does Form ADV say about fees?"), true);
    assert.equal(isDocumentContentQuestion("What's for lunch?"), false);
  });

  it("recognizes regulatory file names", () => {
    assert.equal(
      isRegulatoryDisclosureFileName(
        "Form ADV Part 2A - Firm Disclosure Brochure.pdf"
      ),
      true
    );
    assert.equal(isRegulatoryDisclosureFileName("1026427.pdf"), true);
    assert.equal(
      isRegulatoryDisclosureFileName("Website - kendallcapital.com - Home.txt"),
      false
    );
  });

  it("expands retrieval queries for fee questions", () => {
    const expanded = expandDocumentContentRetrievalQuery("How are fees described?");
    assert.match(expanded, /Form ADV Part 2A/i);
    assert.match(expanded, /Item 5/i);
  });

  it("drops ADV-missing gaps when ADV is in the Space", () => {
    const filtered = filterUnavailableGapsAgainstSpaceDocs(
      [
        "Available sources reference Form ADV Part 2A, but that document does not appear to be available in this Space.",
        "Something else missing.",
      ],
      ["1026427.pdf", "Form ADV Part 2A - Firm Disclosure Brochure.pdf"]
    );
    assert.equal(filtered.length, 1);
    assert.match(filtered[0]!, /Something else/);
  });
});
