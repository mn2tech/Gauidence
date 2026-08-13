import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isJsonMimeOrName, normalizeJsonText } from "../jsonText";

describe("json text helpers", () => {
  it("detects JSON by mime or filename", () => {
    assert.equal(isJsonMimeOrName("application/json", "a.txt"), true);
    assert.equal(isJsonMimeOrName("text/json", "blob"), true);
    assert.equal(isJsonMimeOrName("", "export.JSON"), true);
    assert.equal(isJsonMimeOrName("text/plain", "notes.txt"), false);
  });

  it("pretty-prints valid JSON and keeps invalid text", () => {
    assert.equal(
      normalizeJsonText('{"name":"Ada","roles":["founder"]}'),
      '{\n  "name": "Ada",\n  "roles": [\n    "founder"\n  ]\n}'
    );
    assert.equal(normalizeJsonText("{not json"), "{not json");
    assert.equal(normalizeJsonText("  "), "");
  });
});
