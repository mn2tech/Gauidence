import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("keyword timeout resilience", () => {
  it("soft-fails statement timeouts instead of aborting Ask Gideon", async () => {
    const source = await readFile(
      new URL("../hybridRetrieval.ts", import.meta.url),
      "utf8"
    );
    assert.match(source, /statement timeout\|canceling statement/);
    assert.match(source, /vector-only results/);
  });
});
