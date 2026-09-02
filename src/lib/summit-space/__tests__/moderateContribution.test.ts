import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContributionUpdatePayload } from "@/lib/summit-space/moderateContribution";

describe("contribution admin updates", () => {
  it("builds sanitized update payload", () => {
    const payload = buildContributionUpdatePayload({
      content: "  Updated takeaway  ",
      publishedSummary: "Public version",
      sourceUrl: "https://example.com",
    });

    assert.ok(payload);
    assert.equal(payload.content, "Updated takeaway");
    assert.equal(payload.published_summary, "Public version");
    assert.equal(payload.source_url, "https://example.com/");
  });

  it("strips script tags from admin edits", () => {
    const payload = buildContributionUpdatePayload({
      content: '<script>alert(1)</script>Safe text',
    });

    assert.ok(payload);
    assert.equal(payload.content, "alert(1)Safe text");
  });

  it("returns null when no fields change", () => {
    assert.equal(buildContributionUpdatePayload({}), null);
  });
});
