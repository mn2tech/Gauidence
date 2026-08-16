import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  connectorCitationDocumentId,
  isConnectorCitationDocumentId,
  pickConnectorImageCitations,
} from "../connectorCitationIds.ts";

describe("connectorCitationDocumentId", () => {
  it("prefixes item ids so they never collide with vault UUIDs", () => {
    const id = connectorCitationDocumentId(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    );
    assert.equal(id, "connector:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    assert.equal(isConnectorCitationDocumentId(id), true);
    assert.equal(
      isConnectorCitationDocumentId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      false
    );
  });
});

describe("pickConnectorImageCitations", () => {
  it("keeps the chart named in the answer", () => {
    const picked = pickConnectorImageCitations(
      [
        { fileName: "Ibadat Karo - G.jpg" },
        { fileName: "Silent Night Holy Night - C.jpg" },
        { fileName: "Just As I Am - Bb.pdf" },
      ],
      "Here's the full chart from Silent Night Holy Night - C.jpg - key of C:"
    );
    assert.deepEqual(
      picked.map((c) => c.fileName),
      ["Silent Night Holy Night - C.jpg"]
    );
  });

  it("does not fall back to unrelated charts when the answer names none of them", () => {
    const picked = pickConnectorImageCitations(
      [
        { fileName: "Asha Meri - Eb5 - Short version.jpg" },
        { fileName: "Athyunatha Simhasanamupai - G.jpg" },
      ],
      "Great choice — your space has All to Jesus I Surrender - C."
    );
    assert.deepEqual(picked, []);
  });

  it("keeps opaque Trello chart ids named in the answer and drops unrelated PDFs", () => {
    const picked = pickConnectorImageCitations(
      [
        { fileName: "trello6283425547712481893.jpg" },
        { fileName: "Lord, I hope this day is good - D.pdf" },
        { fileName: "Let's Learn Music.pdf" },
      ],
      "Hillsong Young & Free version — Key D (from trello6283425547712481893.jpg):\n- Intro: G D Asus"
    );
    assert.deepEqual(
      picked.map((c) => c.fileName),
      ["trello6283425547712481893.jpg"]
    );
  });
});
