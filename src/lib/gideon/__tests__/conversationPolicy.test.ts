import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enforceConversationPolicy,
  ensureConversationalContinuation,
} from "../conversationPolicy";

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

describe("ensureConversationalContinuation", () => {
  it("continues a missing pastor-directory answer with a binary invitation", () => {
    const answer = ensureConversationalContinuation({
      userQuestion: "pastor names",
      answer:
        "The churches page does not list a current pastor for each of the 12 churches.",
      suggestedQuestions: ["Which churches are missing pastor names?"],
    });

    assert.match(answer, /help you build the missing pastor directory\?$/i);
  });

  it("turns a show suggestion into a natural next-step question", () => {
    const answer = ensureConversationalContinuation({
      userQuestion: "How many churches are there?",
      answer: "Word Ministries of India has 12 churches.",
      suggestedQuestions: ["Show church names from my spaces?"],
    });

    assert.match(answer, /Would you like me to show church names/i);
  });

  it("does not add a second question", () => {
    const answer = "There are 12 churches. Would you like to see their names?";
    assert.equal(
      ensureConversationalContinuation({
        userQuestion: "How many churches are there?",
        answer,
        suggestedQuestions: ["Show church names?"],
      }),
      answer
    );
  });
});
