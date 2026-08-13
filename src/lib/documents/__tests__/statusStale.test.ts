import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("document status stale recovery", () => {
  it("does not mark live analyze workers stale before process-jobs maxDuration", () => {
    const source = readFileSync(
      join(__dirname, "../../../app/api/documents/[id]/status/route.ts"),
      "utf8"
    );
    assert.match(source, /analyze_document:\s*6\s*\*\s*60\s*\*\s*1000/);
    assert.doesNotMatch(source, /analyze_document:\s*90_000/);
  });
});
