import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canManageConnectedSource,
  connectedSourceAccessForUser,
  isProfileSharedSourceType,
} from "../services/connectionAccess";

describe("connectionAccess", () => {
  it("marks owner vs shared access", () => {
    assert.equal(
      connectedSourceAccessForUser("owner-id", "owner-id"),
      "owner"
    );
    assert.equal(
      connectedSourceAccessForUser("owner-id", "member-id"),
      "shared"
    );
  });

  it("only allows owners to manage connections", () => {
    assert.equal(canManageConnectedSource("owner-id", "owner-id"), true);
    assert.equal(canManageConnectedSource("owner-id", "member-id"), false);
  });

  it("treats trello and google drive as profile-shareable", () => {
    assert.equal(isProfileSharedSourceType("trello"), true);
    assert.equal(isProfileSharedSourceType("google_drive"), true);
    assert.equal(isProfileSharedSourceType("android_storage"), false);
  });
});
