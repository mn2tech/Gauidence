import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectDocumentCharacteristics,
  resolveAnalysisInputMode,
  shouldPreparePageImages,
} from "../inputMode.ts";

describe("analysis input mode", () => {
  it("routes empty-text short PDFs to visual mode", () => {
    const c = detectDocumentCharacteristics({
      mimeType: "application/pdf",
      extraction: {
        quality: 0,
        pageCount: 2,
        charCount: 0,
        text: "",
      },
    });
    assert.equal(c.likelyVisuallyStructured, true);
    assert.equal(resolveAnalysisInputMode(c), "visual");
  });

  it("routes image uploads to visual mode", () => {
    const c = detectDocumentCharacteristics({
      mimeType: "image/png",
      extraction: { quality: 0, pageCount: 1, charCount: 0, text: "" },
    });
    assert.equal(resolveAnalysisInputMode(c), "visual");
  });

  it("routes long high-quality text PDFs to text mode", () => {
    const c = detectDocumentCharacteristics({
      mimeType: "application/pdf",
      extraction: {
        quality: 0.8,
        pageCount: 12,
        charCount: 20000,
        text: "A".repeat(500),
      },
    });
    assert.equal(c.likelyTextHeavy, true);
    assert.equal(resolveAnalysisInputMode(c), "text");
  });

  it("routes mid-length PDFs with good text to hybrid", () => {
    const c = detectDocumentCharacteristics({
      mimeType: "application/pdf",
      extraction: {
        quality: 0.7,
        pageCount: 6,
        charCount: 3000,
        text: "A".repeat(100),
      },
    });
    assert.equal(resolveAnalysisInputMode(c), "hybrid");
  });

  it("does not rasterize scanned PDFs (Claude PDF path)", () => {
    assert.equal(
      shouldPreparePageImages({ quality: 0, pageCount: 2 }),
      false
    );
    assert.equal(
      shouldPreparePageImages({ quality: 0.2, pageCount: 4 }),
      false
    );
  });

  it("rasterizes only short PDFs with usable native text", () => {
    assert.equal(
      shouldPreparePageImages({ quality: 0.7, pageCount: 2 }),
      true
    );
    assert.equal(
      shouldPreparePageImages({ quality: 0.7, pageCount: 6 }),
      false
    );
  });
});
