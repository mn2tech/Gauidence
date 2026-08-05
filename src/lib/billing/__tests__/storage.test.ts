import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStorageSnapshot,
  summarizeDocumentRows,
} from "../storage";
import { formatStorageBytes } from "../storageFormat";
import { PLAN_LIMITS } from "../plans";

describe("storage billing", () => {
  it("summarizes files vs images", () => {
    const usage = summarizeDocumentRows([
      {
        size_bytes: 1_000_000,
        mime_type: "application/pdf",
        file_name: "lease.pdf",
      },
      {
        size_bytes: 500_000,
        mime_type: "image/jpeg",
        file_name: "scan.jpg",
      },
      {
        size_bytes: 200_000,
        mime_type: "text/plain",
        file_name: "notes.txt",
      },
    ]);

    assert.equal(usage.totalBytes, 1_700_000);
    assert.equal(usage.fileCount, 2);
    assert.equal(usage.imageCount, 1);
    assert.equal(usage.imageBytes, 500_000);
    assert.equal(usage.fileBytes, 1_200_000);
  });

  it("builds percent used for snapshots", () => {
    const snapshot = buildStorageSnapshot({
      accountId: "user-1",
      plan: "free",
      limitBytes: PLAN_LIMITS.free.storageBytes,
      usage: {
        totalBytes: PLAN_LIMITS.free.storageBytes / 2,
        fileBytes: 0,
        fileCount: 0,
        imageBytes: 0,
        imageCount: 0,
      },
    });

    assert.equal(snapshot.percentUsed, 50);
    assert.equal(snapshot.remainingBytes, PLAN_LIMITS.free.storageBytes / 2);
  });

  it("formats gigabytes for the storage meter", () => {
    assert.equal(formatStorageBytes(1.6 * 1024 * 1024 * 1024), "1.6 GB");
    assert.equal(formatStorageBytes(20 * 1024 * 1024 * 1024), "20 GB");
  });
});
