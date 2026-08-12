import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reconcileScan } from "../reconcile";
import type { SourceItem } from "../types";

function item(
  externalId: string,
  overrides: Partial<SourceItem> = {}
): SourceItem {
  return {
    sourceId: "src-1",
    externalId,
    name: overrides.name ?? externalId,
    sourceUri: overrides.sourceUri ?? `uri://${externalId}`,
    processingStatus: "discovered",
    ...overrides,
  };
}

describe("scan reconciliation", () => {
  it("discovers new files", () => {
    const result = reconcileScan([], [item("a.pdf"), item("b.jpg")]);
    assert.equal(result.summary.newCount, 2);
    assert.equal(result.toUpsert.length, 2);
    assert.equal(result.toMarkUnavailable.length, 0);
  });

  it("does not duplicate unchanged files on rescan", () => {
    const existing = [
      {
        externalId: "a.pdf",
        name: "a.pdf",
        sourceUri: "uri://a.pdf",
        sizeBytes: 10,
        modifiedAt: "2026-08-01T00:00:00.000Z",
        processingStatus: "discovered",
      },
    ];
    const scanned = [
      item("a.pdf", {
        sizeBytes: 10,
        modifiedAt: "2026-08-01T00:00:00.000Z",
      }),
    ];
    const result = reconcileScan(existing, scanned);
    assert.equal(result.summary.newCount, 0);
    assert.equal(result.summary.updatedCount, 0);
    assert.equal(result.summary.unchangedCount, 1);
    assert.equal(result.toUpsert.length, 0);
  });

  it("updates changed files", () => {
    const existing = [
      {
        externalId: "a.pdf",
        name: "a.pdf",
        sizeBytes: 10,
        processingStatus: "discovered",
      },
    ];
    const result = reconcileScan(existing, [
      item("a.pdf", { sizeBytes: 20 }),
    ]);
    assert.equal(result.summary.updatedCount, 1);
    assert.equal(result.toUpsert[0]?.sizeBytes, 20);
  });

  it("marks missing files unavailable", () => {
    const existing = [
      {
        externalId: "gone.pdf",
        name: "gone.pdf",
        processingStatus: "discovered",
      },
      {
        externalId: "stay.pdf",
        name: "stay.pdf",
        processingStatus: "discovered",
      },
    ];
    const result = reconcileScan(existing, [item("stay.pdf")]);
    assert.deepEqual(result.toMarkUnavailable, ["gone.pdf"]);
    assert.equal(result.summary.unavailableCount, 1);
  });

  it("does not mark unavailable when scan returns zero files", () => {
    const existing = [
      {
        externalId: "a.pdf",
        name: "a.pdf",
        processingStatus: "discovered",
      },
    ];
    const result = reconcileScan(existing, []);
    assert.deepEqual(result.toMarkUnavailable, []);
    assert.equal(result.summary.unavailableCount, 0);
  });

  it("revives previously unavailable files that reappear", () => {
    const existing = [
      {
        externalId: "a.pdf",
        name: "a.pdf",
        processingStatus: "unavailable",
      },
    ];
    const result = reconcileScan(existing, [item("a.pdf")]);
    assert.equal(result.summary.updatedCount, 1);
    assert.equal(result.toUpsert[0]?.processingStatus, "discovered");
  });

  it("supports nested folder paths as stable external ids", () => {
    const scanned = [
      item("Receipts/2026/a.pdf"),
      item("Receipts/b.jpg"),
    ];
    const result = reconcileScan([], scanned);
    assert.equal(result.summary.discovered, 2);
    assert.ok(
      result.toUpsert.every((row) => row.externalId.includes("/"))
    );
  });
});
