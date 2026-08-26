import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { visionStatusLabel } from "../status.ts";

describe("Guardian Vision status labels", () => {
  it("shows Analyzing image... while work is in progress", () => {
    assert.equal(
      visionStatusLabel({
        mimeType: "image/jpeg",
        fileName: "photo.jpg",
        doc: { analysis_status: "analyzing", processing_step: "analyzing" },
      }),
      "Analyzing image..."
    );
    assert.equal(
      visionStatusLabel({
        mimeType: "image/png",
        fileName: "shot.png",
        doc: { analysis_status: "queued", processing_step: "queued" },
      }),
      "Analyzing image..."
    );
  });

  it("shows Ready to ask Gideon when ready", () => {
    assert.equal(
      visionStatusLabel({
        mimeType: "image/jpeg",
        fileName: "photo.jpg",
        doc: {
          analysis_status: "completed",
          indexing_status: "completed",
          knowledge_status: "skipped",
        },
      }),
      "Ready to ask Gideon"
    );
  });

  it("shows Analysis failed without model or OCR names", () => {
    const label = visionStatusLabel({
      mimeType: "image/jpeg",
      fileName: "photo.jpg",
      doc: {
        analysis_status: "failed",
        last_processing_error: "Claude vision timeout",
      },
    });
    assert.equal(label, "Analysis failed");
    assert.doesNotMatch(label, /OCR|Claude|model/i);
  });

  it("keeps document labels for PDFs", () => {
    const label = visionStatusLabel({
      mimeType: "application/pdf",
      fileName: "invoice.pdf",
      doc: {
        analysis_status: "completed",
        indexing_status: "completed",
        knowledge_status: "skipped",
      },
    });
    assert.equal(label, "Ready to ask Gideon");
  });
});
