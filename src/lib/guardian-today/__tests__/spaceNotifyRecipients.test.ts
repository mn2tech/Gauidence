import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipientsForSpaceItem } from "@/lib/guardian-today/spaceNotifyRecipients";

describe("recipientsForSpaceItem", () => {
  it("fans out to space members when present", () => {
    const map = new Map([["space-1", ["owner", "partner"]]]);
    assert.deepEqual(
      recipientsForSpaceItem("space-1", "owner", map),
      ["owner", "partner"]
    );
  });

  it("falls back to item owner when space has no members", () => {
    assert.deepEqual(
      recipientsForSpaceItem("space-1", "owner", new Map()),
      ["owner"]
    );
  });

  it("falls back when space_id missing", () => {
    assert.deepEqual(
      recipientsForSpaceItem(null, "owner", new Map()),
      ["owner"]
    );
  });
});
