import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPastedTextFile } from "../pastedText.ts";

describe("pasted text vault upload", () => {
  it("builds a text/plain File with title and source", async () => {
    const file = buildPastedTextFile({
      title: "USCIS award",
      content: "Vault software for secrets management…",
      sourceUrl: "https://example.com/article",
    });
    assert.equal(file.type, "text/plain");
    assert.match(file.name, /\.txt$/i);
    assert.match(file.name, /USCIS/i);
    const text = await file.text();
    assert.match(text, /Title: USCIS award/);
    assert.match(text, /Source: https:\/\/example.com\/article/);
    assert.match(text, /Vault software for secrets management/);
  });
});
