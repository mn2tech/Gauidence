import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGideonEmptyAnswerFallback,
  GIDEON_EMPTY_ANSWER_FALLBACK,
} from "../vaultChatErrors.ts";

describe("vault chat errors", () => {
  it("uses a scoped fallback when retrieval found no excerpts", () => {
    const scoped = buildGideonEmptyAnswerFallback({
      chunks: [],
      explicitSpaceName: "Personal",
    });
    assert.match(scoped, /Personal/);
    assert.notEqual(scoped, GIDEON_EMPTY_ANSWER_FALLBACK);
  });

  it("keeps a helpful fallback when excerpts exist but the model was blank", () => {
    const fallback = buildGideonEmptyAnswerFallback({
      chunks: [{ profile_id: "personal" }],
    });
    assert.match(fallback, /couldn't finish the answer/i);
    assert.notEqual(fallback, GIDEON_EMPTY_ANSWER_FALLBACK);
  });
});
