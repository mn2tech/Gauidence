import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classificationFromFileName } from "../filenameHints.ts";

describe("classificationFromFileName", () => {
  it("detects contract-style file names", () => {
    const hint = classificationFromFileName(
      "Onyx_NM2TECH_CTR-2025-003 agreement MOD_signed.pdf"
    );
    assert.equal(hint?.document_type, "contract");
    assert.ok((hint?.classification_confidence ?? 0) >= 0.9);
  });

  it("returns null for unrelated names", () => {
    assert.equal(classificationFromFileName("summer-camp-flyer.pdf"), null);
  });
});
