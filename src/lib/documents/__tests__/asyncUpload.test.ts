import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("async upload pipeline contracts", () => {
  it("uses stable pipeline version for deduplication", async () => {
    const source = await readFile(
      new URL("../processingJobs.ts", import.meta.url),
      "utf8"
    );
    assert.match(source, /export const PIPELINE_VERSION = "v1"/);
  });

  it("analyze route allows longer runs for sync JSON/CSV analysis", async () => {
    const source = await readFile(
      new URL("../../../app/api/documents/analyze/route.ts", import.meta.url),
      "utf8"
    );
    assert.match(source, /export const maxDuration = 120/);
    assert.match(source, /isCsvMimeOrName/);
  });

  it("analyze handler returns queued payload shape for async docs", async () => {
    const source = await readFile(
      new URL("../../../app/api/documents/analyze/route.ts", import.meta.url),
      "utf8"
    );
    assert.match(source, /queued:\s*true/);
    assert.match(source, /enqueueAnalyzePipeline/);
    assert.match(source, /isJsonMimeOrName/);
    assert.match(source, /isCsvMimeOrName/);
    assert.match(source, /processDocumentProcessingJob/);
    assert.doesNotMatch(source, /runAnalysisPipeline\(/);
    assert.doesNotMatch(source, /processPendingDocumentJobs/);
  });

  it("processing jobs chain analyze then index then knowledge", async () => {
    const source = await readFile(
      new URL("../processingJobs.ts", import.meta.url),
      "utf8"
    );
    assert.match(source, /analyze_document/);
    assert.match(source, /index_document/);
    assert.match(source, /extract_knowledge/);
    assert.match(source, /enqueueNextStage/);
  });

  it("client upload schedules analysis without blocking on pipeline", async () => {
    const source = await readFile(
      new URL("../../vault/clientUpload.ts", import.meta.url),
      "utf8"
    );
    assert.match(source, /scheduleDocumentAnalysis/);
    assert.doesNotMatch(source, /ANALYZE_CLIENT_TIMEOUT_MS/);
  });
});
