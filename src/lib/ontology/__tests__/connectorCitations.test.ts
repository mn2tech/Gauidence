import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  connectorCitationDocumentId,
  isConnectorCitationDocumentId,
  isLikelyChordChartFile,
  pickConnectorCitationsForChartQuery,
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

  it("matches Trello card titles mentioned in the lyrics answer", () => {
    const picked = pickConnectorImageCitations(
      [
        {
          fileName: "trello6283425547712481893.jpg",
          cardName: "Lord Send Revival - Nov 05, 2023",
          isImage: true,
        },
        {
          fileName: "other.jpg",
          cardName: "All to Jesus I Surrender",
          isImage: true,
        },
      ],
      "Here is Lord Send Revival (Hillsong, Key G) from your space:"
    );
    assert.deepEqual(
      picked.map((c) => c.fileName),
      ["trello6283425547712481893.jpg"]
    );
  });
});

describe("pickConnectorCitationsForChartQuery", () => {
  it("falls back to card title vs question when answer omits the filename", () => {
    const picked = pickConnectorCitationsForChartQuery(
      [
        {
          fileName: "trello6283425547712481893.jpg",
          cardName: "Lord Send Revival - Nov 05, 2023",
          isImage: true,
          mimeType: "image/jpeg",
        },
        {
          fileName: "unrelated.jpg",
          cardName: "Silent Night",
          isImage: true,
          mimeType: "image/jpeg",
        },
      ],
      "Chords and lyrics for Lord Send Revival",
      "Here is the chart with lyrics — Key G.",
      ["Lord Send Revival"],
      4
    );
    assert.deepEqual(
      picked.map((c) => c.fileName),
      ["trello6283425547712481893.jpg"]
    );
  });

  it("matches What a Beautiful Name from the question even when answer hedges", () => {
    const picked = pickConnectorCitationsForChartQuery(
      [
        {
          fileName: "trello999.jpg",
          cardName: "What a Beautiful Name - Bb",
          isImage: true,
          mimeType: "image/jpeg",
        },
      ],
      "Chords and lyrics for What a Beautiful Name",
      "From what's available right now, I don't have a file inventory showing a separate JPG.",
      ["what a beautiful name"],
      4
    );
    assert.deepEqual(
      picked.map((c) => c.fileName),
      ["trello999.jpg"]
    );
  });

  it("prefers the Key C chart when the answer names Key C", () => {
    const picked = pickConnectorCitationsForChartQuery(
      [
        {
          fileName: "trello636.jpg",
          cardName: "What a Beautiful Name - C",
          isImage: true,
          mimeType: "image/jpeg",
        },
        {
          fileName: "trello114.jpg",
          cardName: "What a Beautiful Name - Bb",
          isImage: true,
          mimeType: "image/jpeg",
        },
      ],
      "Chords and lyrics for What a Beautiful Name",
      "Here's What a Beautiful Name — Key C from your space.",
      ["What a Beautiful Name"],
      4
    );
    assert.deepEqual(
      picked.map((c) => c.fileName),
      ["trello636.jpg"]
    );
  });
});

describe("isLikelyChordChartFile", () => {
  it("keeps SongSelect charts and drops finger/lyrics-only PDFs", () => {
    assert.equal(
      isLikelyChordChartFile(
        "Come+Lord+Jesus+(Even+So+Come)+-+SongSelect+Chart+in+Bb+(1).pdf",
        "application/pdf"
      ),
      true
    );
    assert.equal(
      isLikelyChordChartFile(
        "McGill_Music_Sax_School_Finger_Chart.pdf",
        "application/pdf"
      ),
      false
    );
    assert.equal(
      isLikelyChordChartFile(
        "Shoonya se leke toone mujhe - Telugu lyrics.pdf",
        "application/pdf"
      ),
      false
    );
    assert.equal(
      isLikelyChordChartFile(
        "WMOI OCTOBER 2021 FINANCIAL HELP REPORT.pdf",
        "application/pdf"
      ),
      false
    );
    assert.equal(
      isLikelyChordChartFile("Just As I Am - Bb.pdf", "application/pdf"),
      true
    );
    assert.equal(
      isLikelyChordChartFile("trello999.pdf", "application/pdf"),
      true
    );
    assert.equal(
      isLikelyChordChartFile(
        "N9BP248929-ACORDAPP25.pdf",
        "application/pdf"
      ),
      false
    );
  });
});
