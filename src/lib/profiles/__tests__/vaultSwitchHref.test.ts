import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vaultSwitchHref } from "../../routes.ts";

describe("vaultSwitchHref", () => {
  it("points the query and hash at the newly selected space", () => {
    const href = vaultSwitchHref(
      "space-b",
      new URLSearchParams("docs=1&profileId=space-a")
    );
    assert.equal(href, "/dashboard?docs=1&profileId=space-b#documents-space-b");
  });

  it("adds docs=1 when missing", () => {
    const href = vaultSwitchHref("space-b", new URLSearchParams());
    assert.equal(href, "/dashboard?profileId=space-b&docs=1#documents-space-b");
  });
});
