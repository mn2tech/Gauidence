import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PIPELINE_VERSION } from "../processingJobs.ts";

describe("async upload pipeline contracts", () => {
  it("uses stable pipeline version for deduplication", () => {
    assert.equal(PIPELINE_VERSION, "v1");
  });

  it("analyze route maxDuration is short for queue-only responses", async () => {
    const route = await import(
      "../../../app/api/documents/analyze/route.ts"
    );
    assert.equal(route.maxDuration, 30);
  });

  it("analyze handler returns queued payload shape", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../../app/api/documents/analyze/route.ts", import.meta.url),
        "utf8"
      )
    );
    assert.match(source, /queued:\s*true/);
    assert.match(source, /enqueueAnalyzePipeline/);
    assert.doesNotMatch(source, /runAnalysisPipeline\(/);
    assert.doesNotMatch(source, /processPendingDocumentJobs/);
  });

  it("processing jobs chain analyze then index then knowledge", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../processingJobs.ts", import.meta.url),
        "utf8"
      )
    );
    assert.match(source, /analyze_document/);
    assert.match(source, /index_document/);
    assert.match(source, /extract_knowledge/);
    assert.match(source, /enqueueNextStage/);
  });

  it("client upload schedules analysis without blocking on pipeline", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../vault/clientUpload.ts", import.meta.url),
        "utf8"
      )
    );
    assert.match(source, /scheduleDocumentAnalysis/);
    assert.doesNotMatch(source, /ANALYZE_CLIENT_TIMEOUT_MS/);
  });
});
