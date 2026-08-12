import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mirror of stripRootPrefix used by readClient (kept pure for unit tests). */
function stripRootPrefix(path: string, rootName: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length > 1 && parts[0]?.toLowerCase() === rootName.toLowerCase()) {
    return parts.slice(1).join("/");
  }
  return path;
}

describe("excel/path helpers for analyze read", () => {
  it("strips webkitdirectory root prefix from relative paths", () => {
    assert.equal(
      stripRootPrefix("2025/January/Kpactech01.xlsx", "2025"),
      "January/Kpactech01.xlsx"
    );
    assert.equal(
      stripRootPrefix("January/Kpactech01.xlsx", "2025"),
      "January/Kpactech01.xlsx"
    );
  });
});
