import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveKnowledgeTitle,
  emptyConversationSuggestions,
  extractGideonQuestion,
  mentionsGideon,
} from "../helpers.ts";

describe("mentionsGideon", () => {
  it("detects @Gideon case-insensitively", () => {
    assert.equal(mentionsGideon("@Gideon summarize this"), true);
    assert.equal(mentionsGideon("hey @gideon what fees?"), true);
    assert.equal(mentionsGideon("talk to the team"), false);
    assert.equal(mentionsGideon("gideon without at"), false);
  });
});

describe("extractGideonQuestion", () => {
  it("strips the mention", () => {
    assert.equal(
      extractGideonQuestion("@Gideon summarize the Form CRS"),
      "summarize the Form CRS"
    );
    assert.equal(
      extractGideonQuestion("@Gideon what did we decide about pricing?"),
      "what did we decide about pricing?"
    );
  });

  it("falls back when only the mention remains", () => {
    assert.equal(extractGideonQuestion("@Gideon"), "@Gideon");
  });
});

describe("emptyConversationSuggestions", () => {
  it("returns actionable chips including invite", () => {
    const chips = emptyConversationSuggestions("Acme Advisors");
    assert.ok(chips.length >= 3);
    assert.ok(chips.some((c) => c.action === "ask" && c.prompt?.includes("@Gideon")));
    assert.ok(chips.some((c) => c.action === "invite"));
  });
});

describe("deriveKnowledgeTitle", () => {
  it("truncates long content", () => {
    const long = "A".repeat(100);
    const title = deriveKnowledgeTitle(long, 40);
    assert.ok(title.length <= 41);
    assert.ok(title.endsWith("…"));
  });
});
