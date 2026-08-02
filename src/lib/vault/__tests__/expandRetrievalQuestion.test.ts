import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expandRetrievalQuestion,
  wantsFullDailyLogQuote,
} from "../expandRetrievalQuestion.ts";

describe("expandRetrievalQuestion", () => {
  it("appends recent chat context for vague full-log follow-ups", () => {
    const expanded = expandRetrievalQuestion("can you show us full log", [
      {
        role: "user",
        content: "show the daily log that Aaron added for crossroadconnect",
      },
      {
        role: "assistant",
        content: "Aaron added a note about removing John Marshall Bank.",
      },
    ]);
    assert.match(expanded, /Aaron/);
    assert.match(expanded, /crossroadconnect/);
    assert.match(expanded, /Context from this conversation/);
  });

  it("leaves standalone questions unchanged", () => {
    const question = "show crossroadconnect daily log from July 30";
    assert.equal(expandRetrievalQuestion(question, []), question);
  });
});

describe("wantsFullDailyLogQuote", () => {
  it("detects full log requests", () => {
    assert.equal(wantsFullDailyLogQuote("can you show us full log"), true);
    assert.equal(wantsFullDailyLogQuote("what invoices are due"), false);
  });
});
