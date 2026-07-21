import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  speechRecognitionErrorMessage,
  transcriptFromEvent,
} from "../speechRecognition.ts";

describe("speechRecognition helpers", () => {
  it("merges final and interim transcripts", () => {
    const event = {
      resultIndex: 0,
      results: [
        {
          isFinal: true,
          length: 1,
          0: { transcript: "What needs ", confidence: 0.9 },
          item(i: number) {
            return this[i as 0];
          },
        },
        {
          isFinal: false,
          length: 1,
          0: { transcript: "my attention", confidence: 0.8 },
          item(i: number) {
            return this[i as 0];
          },
        },
      ],
    };
    const { interim, final } = transcriptFromEvent(event);
    assert.equal(final, "What needs");
    assert.equal(interim, "my attention");
  });

  it("maps permission errors to friendly copy", () => {
    assert.match(
      speechRecognitionErrorMessage("not-allowed"),
      /Microphone access/
    );
    assert.equal(speechRecognitionErrorMessage("aborted"), "");
  });
});
