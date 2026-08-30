import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  snippetFromAssistantPlainText,
  titleFromAssistantPlainText,
} from "../actionTitle";

describe("actionTitle", () => {
  it("picks first meaningful line as title", () => {
    const text = [
      "Projects & contracts",
      "NM2TECH Business Intelligence Platform",
      "AI Phone Agent as a paid service",
    ].join("\n");
    assert.equal(
      titleFromAssistantPlainText(text),
      "NM2TECH Business Intelligence Platform"
    );
  });

  it("falls back when empty", () => {
    assert.equal(titleFromAssistantPlainText("   "), "Follow up from Gideon");
  });

  it("builds snippet after title", () => {
    const title = "NM2TECH overview";
    const text = `${title}\nMonthly revenue $83k with four consultants.`;
    const snip = snippetFromAssistantPlainText(text, title);
    assert.ok(snip);
    assert.ok(snip!.includes("Monthly revenue"));
  });
});
