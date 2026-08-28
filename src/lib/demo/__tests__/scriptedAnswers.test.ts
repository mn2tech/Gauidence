import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerDemoQuestion } from "../scriptedAnswers";

describe("answerDemoQuestion", () => {
  it("answers insurance renewal", () => {
    const reply = answerDemoQuestion("When does my car insurance renew?");
    assert.match(reply.answer, /March 15, 2026/);
    assert.ok(reply.sources.some((s) => /insurance/i.test(s)));
  });

  it("answers pets on the lease", () => {
    const reply = answerDemoQuestion("What does my lease say about pets?");
    assert.match(reply.answer, /pets/i);
    assert.match(reply.answer, /\$300/);
  });

  it("lists upcoming expirations", () => {
    const reply = answerDemoQuestion("Which documents expire this year?");
    assert.match(reply.answer, /March 15/);
    assert.match(reply.answer, /August 31/);
    assert.equal(reply.sources.length, 3);
  });

  it("falls back for unrelated questions", () => {
    const reply = answerDemoQuestion("What's the weather in Lagos?");
    assert.match(reply.answer, /demo/i);
    assert.equal(reply.sources.length, 0);
  });
});
