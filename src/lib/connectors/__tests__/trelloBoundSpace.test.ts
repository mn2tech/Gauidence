import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findTrelloBoundProfile,
  TRELLO_PREFERRED_SPACE_NAME,
} from "../trello/boundSpace.ts";

describe("findTrelloBoundProfile", () => {
  it("prefers exact Wednesday Practice", () => {
    const profiles = [
      { id: "1", display_name: "Home" },
      { id: "2", display_name: TRELLO_PREFERRED_SPACE_NAME },
      { id: "3", display_name: "Music" },
    ];
    assert.equal(
      findTrelloBoundProfile(profiles, profiles[0])?.id,
      "2"
    );
  });

  it("falls back to soft music/practice match", () => {
    const profiles = [
      { id: "1", display_name: "Home" },
      { id: "2", display_name: "Living Waters" },
    ];
    assert.equal(findTrelloBoundProfile(profiles)?.id, "2");
  });

  it("falls back to active space", () => {
    const profiles = [
      { id: "1", display_name: "Home" },
      { id: "2", display_name: "Work" },
    ];
    assert.equal(
      findTrelloBoundProfile(profiles, profiles[1])?.id,
      "2"
    );
  });
});
