import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isCsvMimeOrName,
  normalizeCsvText,
  CSV_ANALYSIS_MAX_CHARS,
} from "../csvText";

describe("csv text helpers", () => {
  it("detects CSV by mime or filename", () => {
    assert.equal(isCsvMimeOrName("text/csv", "a.txt"), true);
    assert.equal(isCsvMimeOrName("application/csv", "blob"), true);
    assert.equal(isCsvMimeOrName("", "export.CSV"), true);
    assert.equal(isCsvMimeOrName("text/plain", "notes.txt"), false);
  });

  it("normalizes and caps large CSV text", () => {
    assert.equal(normalizeCsvText("  a,b\n1,2  "), "a,b\n1,2");
    assert.equal(normalizeCsvText("  "), "");
    const big = `h1,h2\n${"x,y\n".repeat(50_000)}`;
    const capped = normalizeCsvText(big, 200);
    assert.ok(capped.length <= 240);
    assert.match(capped, /truncated/);
  });

  it("exposes a prompt-sized analysis cap", () => {
    assert.ok(CSV_ANALYSIS_MAX_CHARS >= 24_000);
  });
});
