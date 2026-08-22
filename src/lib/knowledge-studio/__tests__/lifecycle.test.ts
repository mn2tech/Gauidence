import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archivePatch,
  buildFactEditUpdate,
  canHardDelete,
  canPublish,
  canRestore,
  canUnpublish,
  editLifecyclePatch,
  editSuccessMessage,
  isPubliclyRetrievable,
  publishPatch,
  restorePatch,
  unpublishPatch,
} from "@/lib/knowledge-studio/lifecycle";

describe("knowledge lifecycle patches", () => {
  it("publish makes knowledge public", () => {
    const patch = publishPatch(new Date("2026-08-22T12:00:00.000Z"));
    assert.equal(patch.lifecycle_status, "published");
    assert.equal(patch.visibility, "public");
    assert.equal(patch.published_at, "2026-08-22T12:00:00.000Z");
    assert.equal(
      isPubliclyRetrievable({
        lifecycle_status: patch.lifecycle_status!,
        visibility: patch.visibility!,
      }),
      true
    );
  });

  it("unpublish removes public retrieval", () => {
    const patch = unpublishPatch();
    assert.equal(patch.lifecycle_status, "approved");
    assert.equal(patch.visibility, "private");
    assert.equal(patch.published_at, null);
    assert.equal(
      isPubliclyRetrievable({
        lifecycle_status: "approved",
        visibility: "private",
      }),
      false
    );
  });

  it("archive removes public retrieval", () => {
    const patch = archivePatch();
    assert.equal(patch.lifecycle_status, "archived");
    assert.equal(patch.visibility, "private");
    assert.equal(patch.published_at, null);
    assert.equal(
      isPubliclyRetrievable({
        lifecycle_status: "archived",
        visibility: "private",
      }),
      false
    );
  });

  it("restore returns archived items to draft/private", () => {
    const patch = restorePatch();
    assert.equal(patch.lifecycle_status, "draft");
    assert.equal(patch.visibility, "private");
    assert.equal(canRestore("archived"), true);
    assert.equal(canRestore("draft"), false);
  });

  it("editing published content moves to needs_review/private", () => {
    const patch = editLifecyclePatch("published");
    assert.deepEqual(patch, {
      lifecycle_status: "needs_review",
      visibility: "private",
      published_at: null,
    });
    assert.equal(
      editSuccessMessage("published"),
      "Changes saved. Review and republish this item before attendees can see it."
    );
  });

  it("editing draft keeps lifecycle unchanged", () => {
    assert.deepEqual(editLifecyclePatch("draft"), {});
    assert.deepEqual(
      buildFactEditUpdate("draft", { title: "Updated title" }),
      { title: "Updated title" }
    );
  });

  it("can publish from draft, needs_review, and approved", () => {
    assert.equal(canPublish("draft"), true);
    assert.equal(canPublish("needs_review"), true);
    assert.equal(canPublish("approved"), true);
    assert.equal(canPublish("published"), false);
    assert.equal(canPublish("archived"), false);
  });

  it("can unpublish only published items", () => {
    assert.equal(canUnpublish("published"), true);
    assert.equal(canUnpublish("approved"), false);
  });

  it("only drafts can be hard deleted", () => {
    assert.equal(canHardDelete({ lifecycle_status: "draft" }), true);
    assert.equal(canHardDelete({ lifecycle_status: "published" }), false);
    assert.equal(canHardDelete({ lifecycle_status: "needs_review" }), false);
    assert.equal(canHardDelete({ lifecycle_status: "approved" }), false);
    assert.equal(canHardDelete({ lifecycle_status: "archived" }), false);
  });
});

describe("public retrieval guard", () => {
  const retrievable = {
    lifecycle_status: "published",
    visibility: "public",
  };

  it("allows only published + public", () => {
    assert.equal(isPubliclyRetrievable(retrievable), true);
  });

  for (const status of [
    "draft",
    "needs_review",
    "approved",
    "archived",
  ] as const) {
    it(`blocks ${status}`, () => {
      assert.equal(
        isPubliclyRetrievable({ lifecycle_status: status, visibility: "public" }),
        false
      );
      assert.equal(
        isPubliclyRetrievable({ lifecycle_status: status, visibility: "private" }),
        false
      );
    });
  }

  it("blocks published but private", () => {
    assert.equal(
      isPubliclyRetrievable({
        lifecycle_status: "published",
        visibility: "private",
      }),
      false
    );
  });
});
