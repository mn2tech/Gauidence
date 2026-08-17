import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ensureYouTubeLinksInAnswer,
  extractYouTubeUrls,
  normalizeYouTubeUrl,
  youTubeUrlsFromEntity,
} from "../youtubeUrls.ts";

describe("youtubeUrls", () => {
  it("extracts and normalizes watch / youtu.be links", () => {
    const urls = extractYouTubeUrls(
      "See https://youtu.be/dQw4w9WgXcQ and https://www.youtube.com/watch?v=abcdefghijk"
    );
    assert.deepEqual(urls, [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=abcdefghijk",
    ]);
  });

  it("normalizes embed URLs", () => {
    assert.equal(
      normalizeYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ"),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
  });

  it("reads youtube_url from entity properties", () => {
    const urls = youTubeUrlsFromEntity({
      properties: {
        youtube_url: "https://youtu.be/dQw4w9WgXcQ",
      },
      description: null,
    });
    assert.deepEqual(urls, ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
  });

  it("appends Listen when the answer omitted the link", () => {
    const next = ensureYouTubeLinksInAnswer("Chords in C.", [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ]);
    assert.match(next, /Listen: https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
  });

  it("does not duplicate a link already in the answer", () => {
    const answer =
      "Listen: https://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nChords in C.";
    assert.equal(
      ensureYouTubeLinksInAnswer(answer, [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      ]),
      answer
    );
  });
});
