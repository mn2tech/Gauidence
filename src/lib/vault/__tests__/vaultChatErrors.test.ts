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

  it("keeps the generic fallback when excerpts exist but the model was blank", () => {
    assert.equal(
      buildGideonEmptyAnswerFallback({
        chunks: [{ profile_id: "personal" }],
      }),
      GIDEON_EMPTY_ANSWER_FALLBACK
    );
  });
});
