import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findTrelloBoundProfile,
  isMusicPracticeChatContext,
  looksLikeMusicPracticeSpace,
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

describe("music practice chat context", () => {
  it("does not treat a business space as music practice", () => {
    assert.equal(looksLikeMusicPracticeSpace("NM2TECH - Next Move"), false);
    assert.equal(
      isMusicPracticeChatContext({
        spaceName: "NM2TECH - Next Move",
        boardName: null,
        hasConnectedCharts: false,
      }),
      false
    );
  });

  it("treats Living Waters charts as music practice even on a business space", () => {
    assert.equal(
      isMusicPracticeChatContext({
        spaceName: "NM2TECH - Next Move",
        boardName: "The Living Waters",
        hasConnectedCharts: true,
      }),
      true
    );
  });
});
