import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasBinaryFollowUp } from "../binaryFollowUp";

describe("hasBinaryFollowUp", () => {
  it("recognizes the Daily Log follow-up shown in Gideon chat", () => {
    assert.equal(
      hasBinaryFollowUp(
        "Here is your summary.\n\nWant me to turn this into a Daily Log entry with a confirmed deadline?"
      ),
      true
    );
  });

  it("recognizes common binary invitations", () => {
    assert.equal(hasBinaryFollowUp("Would you like me to draft the reply?"), true);
    assert.equal(hasBinaryFollowUp("Should I save this to your space?"), true);
    assert.equal(hasBinaryFollowUp("Do you want me to add a reminder?"), true);
  });

  it("does not mark open-ended questions as binary", () => {
    assert.equal(hasBinaryFollowUp("What should I follow up on next?"), false);
    assert.equal(hasBinaryFollowUp("Which deadline should I use?"), false);
    assert.equal(hasBinaryFollowUp("Here is your summary."), false);
  });
});
