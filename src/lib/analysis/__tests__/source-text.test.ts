import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { capSourceText, SOURCE_TEXT_MAX_CHARS } from "../../vault/sourceText.ts";

describe("capSourceText", () => {
  it("returns null for empty input", () => {
    assert.equal(capSourceText(""), null);
    assert.equal(capSourceText("   "), null);
    assert.equal(capSourceText(null), null);
  });

  it("normalizes line endings", () => {
    assert.equal(capSourceText("hello\r\nworld"), "hello\nworld");
  });

  it("caps very long extracted text", () => {
    const long = "x".repeat(SOURCE_TEXT_MAX_CHARS + 500);
    const capped = capSourceText(long);
    assert.equal(capped?.length, SOURCE_TEXT_MAX_CHARS);
  });
});
