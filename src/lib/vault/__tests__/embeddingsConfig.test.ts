import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("vault embedding config", () => {
  it("rejects empty and placeholder OpenAI keys", () => {
    const source = readFileSync(
      join(__dirname, "../embeddings.ts"),
      "utf8"
    );
    assert.match(source, /key\.length >= 20/);
    assert.match(source, /key\.startsWith\("sk-"\)/);
  });
});
