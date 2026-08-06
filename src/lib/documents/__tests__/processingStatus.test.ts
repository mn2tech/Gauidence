import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveProcessingStage,
  documentReadiness,
  isDocumentSearchable,
  isProcessingActive,
  processingProgressPercent,
  userFacingStatusLabel,
} from "../processingStatus.ts";

describe("processingStatus", () => {
  it("derives queued stage after upload scheduling", () => {
    assert.equal(
      deriveProcessingStage({ analysis_status: "queued" }),
      "queued"
    );
  });

  it("marks searchable when analysis and indexing complete", () => {
    const doc = {
      analysis_status: "completed",
      indexing_status: "completed",
      knowledge_status: "skipped",
    };
    assert.equal(isDocumentSearchable(doc), true);
    assert.equal(documentReadiness(doc), "knowledge_ready");
    assert.equal(deriveProcessingStage(doc), "ready");
  });

  it("keeps indexing stage after analysis without chunks", () => {
    const doc = {
      analysis_status: "completed",
      indexing_status: "processing",
    };
    assert.equal(deriveProcessingStage(doc), "indexing");
    assert.equal(isDocumentSearchable(doc), false);
  });

  it("does not block ready when knowledge extraction is retryable", () => {
    const doc = {
      analysis_status: "completed",
      indexing_status: "completed",
      knowledge_status: "retryable",
    };
    assert.equal(deriveProcessingStage(doc), "retryable");
    assert.equal(isDocumentSearchable(doc), true);
  });

  it("reports active processing for queued and analyzing states", () => {
    assert.equal(isProcessingActive("queued"), true);
    assert.equal(isProcessingActive("analyzing"), true);
    assert.equal(isProcessingActive("ready"), false);
  });

  it("uses friendly labels without technical terms", () => {
    const label = userFacingStatusLabel({
      analysis_status: "extracting",
      processing_step: "extracting",
    });
    assert.match(label, /Reading document/);
    assert.doesNotMatch(label, /embedding|vector|HNSW/i);
  });

  it("increases progress through pipeline stages", () => {
    assert.ok(
      processingProgressPercent({ analysis_status: "queued" }) <
        processingProgressPercent({
          analysis_status: "completed",
          indexing_status: "processing",
        })
    );
  });
});
