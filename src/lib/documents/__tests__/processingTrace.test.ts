import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildProcessingTrace,
  formatDurationMs,
  topTimingBreakdown,
} from "../processingTrace.ts";

describe("processingTrace", () => {
  it("builds stage durations and finds the slowest completed stage", () => {
    const trace = buildProcessingTrace({
      doc: {
        analysis_status: "completed",
        indexing_status: "processing",
        knowledge_status: "pending",
        processing_started_at: "2026-01-01T00:00:00.000Z",
      },
      jobs: [
        {
          job_type: "analyze_document",
          status: "completed",
          diagnostics: {
            storage_upload_ms: 400,
            llm_analysis_ms: 12_000,
            organization_ms: 1_500,
          },
          processing_started_at: "2026-01-01T00:00:10.000Z",
          processing_completed_at: "2026-01-01T00:00:24.000Z",
          created_at: "2026-01-01T00:00:09.000Z",
        },
        {
          job_type: "index_document",
          status: "processing",
          diagnostics: null,
          processing_started_at: "2026-01-01T00:00:25.000Z",
          processing_completed_at: null,
          created_at: "2026-01-01T00:00:24.500Z",
        },
      ],
      now: Date.parse("2026-01-01T00:00:30.000Z"),
    });

    assert.equal(trace.stages[0]?.status, "completed");
    assert.equal(trace.stages[0]?.durationMs, 14_000);
    assert.equal(trace.stages[1]?.status, "running");
    assert.equal(trace.stages[1]?.durationMs, 5_000);
    assert.equal(trace.slowestStageId, "analyze_document");
    assert.equal(trace.diagnostics.llm_analysis_ms, 12_000);
  });

  it("formats durations for display", () => {
    assert.equal(formatDurationMs(850), "850ms");
    assert.equal(formatDurationMs(4_200), "4s");
    assert.equal(formatDurationMs(125_000), "2m 5s");
  });

  it("ranks timing breakdown without totals", () => {
    const rows = topTimingBreakdown({
      llm_analysis_ms: 9_000,
      embedding_ms: 2_000,
      organization_ms: 1_000,
      total_to_searchable_ms: 12_000,
    });
    assert.deepEqual(
      rows.map((row) => row.key),
      ["llm_analysis_ms", "embedding_ms", "organization_ms"]
    );
  });
});
