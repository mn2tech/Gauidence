import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enforceConversationPolicy } from "../conversationPolicy";

describe("enforceConversationPolicy", () => {
  it("removes an unrelated Daily Log pitch from a factual answer", () => {
    const answer = `12 churches are listed.\n\n## GIDEON'S SUGGESTION\nWant me to build a requirements summary as a Daily Log?`;
    const polished = enforceConversationPolicy(answer, "how many churches?");
    assert.equal(polished, "12 churches are listed.");
  });

  it("preserves a Daily Log proposal when the user asked to save it", () => {
    const answer = `Here is the summary.\n\n## GIDEON'S SUGGESTION\nI can save this as a Daily Log.`;
    assert.equal(
      enforceConversationPolicy(answer, "Save this as a Daily Log"),
      answer
    );
  });

  it("preserves relevant non-log suggestions", () => {
    const answer = `12 churches are listed.\n\n## GIDEON'S SUGGESTION\nThree church records are missing pastor names.`;
    assert.equal(enforceConversationPolicy(answer, "how many churches?"), answer);
  });
});
