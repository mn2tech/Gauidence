import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildItemsFromDescriptors } from "../android/androidStorageScanner";
import { reconcileScan } from "../reconcile";

describe("android storage scanner helpers", () => {
  it("builds source-agnostic items from descriptors", () => {
    const items = buildItemsFromDescriptors("src-1", [
      {
        path: "Downloads/ticket.pdf",
        name: "ticket.pdf",
        mimeType: "application/pdf",
        sizeBytes: 324_000,
        parentFolder: "Downloads",
      },
      {
        path: "Downloads/nested/photo.jpg",
        name: "photo.jpg",
        mimeType: "image/jpeg",
        parentFolder: "Downloads/nested",
      },
    ]);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.externalId, "Downloads/ticket.pdf");
    assert.equal(items[0]?.metadata?.extension, "pdf");
    assert.equal(items[1]?.metadata?.parentFolder, "Downloads/nested");
  });

  it("duplicate scan yields no new upserts when unchanged", () => {
    const scanned = buildItemsFromDescriptors("src-1", [
      {
        path: "a.txt",
        name: "a.txt",
        sizeBytes: 5,
        modifiedAt: "2026-08-11T00:00:00.000Z",
      },
    ]);
    const existing = scanned.map((s) => ({
      externalId: s.externalId,
      name: s.name,
      mimeType: s.mimeType,
      sourceUri: s.sourceUri,
      sizeBytes: s.sizeBytes,
      modifiedAt: s.modifiedAt,
      processingStatus: "discovered",
    }));
    const first = reconcileScan([], scanned);
    assert.equal(first.summary.newCount, 1);
    const second = reconcileScan(existing, scanned);
    assert.equal(second.summary.newCount, 0);
    assert.equal(second.summary.unchangedCount, 1);
  });

  it("unsupported / unknown extensions still become discovered items", () => {
    const items = buildItemsFromDescriptors("src-1", [
      { path: "weird.xyz", name: "weird.xyz" },
    ]);
    assert.equal(items[0]?.processingStatus, "discovered");
    assert.equal(items[0]?.metadata?.extension, "xyz");
  });
});
