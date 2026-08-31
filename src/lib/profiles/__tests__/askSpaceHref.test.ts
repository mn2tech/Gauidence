import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askSpaceHref } from "../../routes.ts";

describe("askSpaceHref", () => {
  it("points the query at the newly selected space", () => {
    const href = askSpaceHref(
      "space-b",
      new URLSearchParams("profileId=space-a&chatId=chat-1")
    );
    assert.equal(href, "/ask?profileId=space-b&chatId=chat-1");
  });

  it("can clear chat and draft pointers when switching spaces", () => {
    const href = askSpaceHref(
      "space-b",
      new URLSearchParams("profileId=space-a&chatId=chat-1&draft=hello"),
      { clearChat: true }
    );
    assert.equal(href, "/ask?profileId=space-b");
  });

  it("can clear chat and carry a draft into the new space", () => {
    const href = askSpaceHref(
      "space-b",
      new URLSearchParams("profileId=space-a&chatId=chat-1"),
      { clearChat: true, draft: "Nolan's spelling test" }
    );
    assert.equal(
      href,
      "/ask?profileId=space-b&draft=Nolan%27s+spelling+test"
    );
  });
});
