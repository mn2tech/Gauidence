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

  it("treats skipped indexing as ready to ask Gideon", () => {
    const doc = {
      analysis_status: "completed",
      indexing_status: "skipped",
      knowledge_status: "skipped",
      processing_step: "ready",
    };
    assert.equal(isDocumentSearchable(doc), true);
    assert.equal(deriveProcessingStage(doc), "ready");
    assert.equal(userFacingStatusLabel(doc), "Ready to ask Gideon");
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
    assert.equal(deriveProcessingStage(doc), "ready");
    assert.equal(isDocumentSearchable(doc), true);
    assert.equal(userFacingStatusLabel(doc), "Ready to ask Gideon");
  });

  it("still pauses when indexing is retryable", () => {
    assert.equal(
      deriveProcessingStage({
        analysis_status: "completed",
        indexing_status: "retryable",
        knowledge_status: "pending",
      }),
      "retryable"
    );
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

  it("ignores a stale queued step after analysis completes", () => {
    assert.equal(
      userFacingStatusLabel({
        analysis_status: "completed",
        indexing_status: "completed",
        knowledge_status: "skipped",
        processing_step: "queued",
      }),
      "Ready to ask Gideon"
    );
  });

  it("keeps waiting label only while analysis is still queued", () => {
    assert.equal(
      userFacingStatusLabel({
        analysis_status: "queued",
        processing_step: "queued",
      }),
      "Waiting for analysis"
    );
  });

  it("uses indexing label after analysis when step is still queued", () => {
    assert.equal(
      userFacingStatusLabel({
        analysis_status: "completed",
        indexing_status: "pending",
        processing_step: "queued",
      }),
      "Making document searchable"
    );
  });

  it("shows retry when analysis fell back to uploaded with an error", () => {
    assert.equal(
      deriveProcessingStage({
        analysis_status: "uploaded",
        last_processing_error: "Claude request too large",
      }),
      "retryable"
    );
    assert.equal(
      userFacingStatusLabel({
        analysis_status: "uploaded",
        last_processing_error: "Claude request too large",
      }),
      "Processing paused — tap Retry"
    );
    assert.equal(
      deriveProcessingStage({ analysis_status: "uploaded" }),
      "uploaded"
    );
  });

  it("uses vision labels for image documents", () => {
    assert.equal(
      userFacingStatusLabel({
        analysis_status: "analyzing",
        processing_step: "analyzing",
        mime_type: "image/jpeg",
        file_name: "photo.jpg",
      }),
      "Analyzing image..."
    );
    assert.equal(
      userFacingStatusLabel({
        analysis_status: "completed",
        indexing_status: "completed",
        knowledge_status: "skipped",
        mime_type: "image/png",
        file_name: "shot.png",
      }),
      "Ready to ask Gideon"
    );
    assert.equal(
      userFacingStatusLabel({
        analysis_status: "failed",
        mime_type: "image/jpeg",
        file_name: "photo.jpg",
      }),
      "Analysis failed"
    );
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
