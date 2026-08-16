import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  entityMatchesSongTitle,
  sanitizeChartTranscript,
} from "../pipeline/chartTranscript";

describe("sanitizeChartTranscript", () => {
  it("drops practice-template and Share chrome", () => {
    const cleaned = sanitizeChartTranscript(`Verse: G D A
Come Holy Spirit
Share
14. Chorus:
Am Dm
I surrender all
45. Check the song list before the next Wednesday practice
Upload chord charts following the naming convention`);
    assert.match(cleaned, /Come Holy Spirit/);
    assert.match(cleaned, /I surrender all/);
    assert.doesNotMatch(cleaned, /Check the song list/);
    assert.doesNotMatch(cleaned, /^Share$/m);
    assert.doesNotMatch(cleaned, /Upload chord charts/);
  });
});

describe("entityMatchesSongTitle", () => {
  it("matches Lord Send Revival and rejects All to Jesus", () => {
    assert.equal(
      entityMatchesSongTitle("Lord Send Revival - Nov 05, 2023", "lord send revival"),
      true
    );
    assert.equal(
      entityMatchesSongTitle(
        "All to Jesus | Surrender - Song Lyrics with Chords",
        "lord send revival"
      ),
      false
    );
  });
});
