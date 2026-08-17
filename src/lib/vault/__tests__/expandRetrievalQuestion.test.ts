import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expandRetrievalQuestion,
  wantsFullDailyLogQuote,
  extractChartTitlesFromText,
  isPianoOrSongLearnRequest,
  wantsOpenChartAttachment,
  buildOpenChartAttachmentAnswer,
} from "../expandRetrievalQuestion.ts";

describe("expandRetrievalQuestion", () => {
  it("appends recent chat context for vague full-log follow-ups", () => {
    const expanded = expandRetrievalQuestion("can you show us full log", [
      {
        role: "user",
        content: "show the daily log that Aaron added for crossroadconnect",
      },
      {
        role: "assistant",
        content: "Aaron added a note about removing John Marshall Bank.",
      },
    ]);
    assert.match(expanded, /Aaron/);
    assert.match(expanded, /crossroadconnect/);
    assert.match(expanded, /Context from this conversation/);
  });

  it("leaves standalone questions unchanged", () => {
    const question = "show crossroadconnect daily log from July 30";
    assert.equal(expandRetrievalQuestion(question, []), question);
  });

  it("focuses piano learn requests on named chart files", () => {
    const expanded = expandRetrievalQuestion(
      "I want to learn this song on piano help me\nAsha Meri - Eb5 - Short version.jpg",
      []
    );
    assert.match(expanded, /Focus on these songs/);
    assert.match(expanded, /Asha Meri/);
  });

  it("pulls song titles from a recent list for vague piano help", () => {
    const expanded = expandRetrievalQuestion(
      "I want to learn this song on piano help me",
      [
        {
          role: "assistant",
          content:
            "Songs/charts in your Wednesday Practice space (3):\n• Asha Meri\n• Athyunatha Simhasanamupai\n• Silent Night Holy Night",
        },
      ]
    );
    assert.match(expanded, /Asha Meri/);
    assert.match(expanded, /Songs recently discussed/);
  });

  it("keeps recent song context for JPG/PDF follow-ups", () => {
    const expanded = expandRetrievalQuestion("what about jpg or pdf", [
      {
        role: "user",
        content: "Chords and lyrics for What a Beautiful Name",
      },
      {
        role: "assistant",
        content: "Here are the chords for What a Beautiful Name.",
      },
    ]);
    assert.match(expanded, /What a Beautiful Name/);
    assert.match(expanded, /Songs recently discussed/);
  });
});

describe("extractChartTitlesFromText", () => {
  it("reads titles from filenames", () => {
    const titles = extractChartTitlesFromText(
      "Asha Meri - Eb5 - Short version.jpg\nAthyunatha Simhasanamupai - G.jpg"
    );
    assert.ok(titles.some((t) => /Asha Meri/i.test(t)));
    assert.ok(titles.some((t) => /Athyunatha/i.test(t)));
  });

  it("reads titles from chords-and-lyrics phrasing", () => {
    const titles = extractChartTitlesFromText(
      "Chords and lyrics for Lord Send Revival"
    );
    assert.deepEqual(titles, ["Lord Send Revival"]);
  });

  it("reads a bare chart title with key", () => {
    const titles = extractChartTitlesFromText("What a Beautiful Name - C");
    assert.deepEqual(titles, ["What a Beautiful Name"]);
  });

  it("reads song title from PDF roster bullets", () => {
    const titles = extractChartTitlesFromText(
      `PDF charts in your Wednesday Practice space (1):
• Even So Come (Come+Lord+Jesus+(Even+So+Come)+-+SongSelect+Chart+in+Bb+(1).pdf)`
    );
    assert.ok(titles.some((t) => /^Even So Come$/i.test(t)));
  });
});

describe("isPianoOrSongLearnRequest", () => {
  it("detects piano learn asks", () => {
    assert.equal(
      isPianoOrSongLearnRequest("I want to learn this song on piano help me"),
      true
    );
    assert.equal(isPianoOrSongLearnRequest("what invoices are due"), false);
  });
});

describe("wantsOpenChartAttachment", () => {
  it("detects open/show PDF follow-ups", () => {
    assert.equal(wantsOpenChartAttachment("open this pdf"), true);
    assert.equal(wantsOpenChartAttachment("Show the chart"), true);
    assert.equal(wantsOpenChartAttachment("List the PDF chord charts"), false);
  });

  it("builds an answer that names the PDF Source", () => {
    const result = buildOpenChartAttachmentAnswer({
      question: "open this pdf",
      history: [
        {
          role: "assistant",
          content: `PDF charts in your Wednesday Practice space (1):
• Even So Come (Come+Lord+Jesus+(Even+So+Come)+-+SongSelect+Chart+in+Bb+(1).pdf)`,
        },
      ],
      citations: [
        {
          documentId: "connector:1",
          fileName:
            "Come+Lord+Jesus+(Even+So+Come)+-+SongSelect+Chart+in+Bb+(1).pdf",
          cardName: "Even So Come",
          kind: "connector",
          mimeType: "application/pdf",
        },
      ],
    });
    assert.ok(result);
    assert.match(result!.answer, /Even So Come/);
    assert.match(result!.answer, /Source preview/i);
    assert.match(result!.answer, /SongSelect/);
    assert.equal(result!.citations.length, 1);
  });
});

describe("wantsFullDailyLogQuote", () => {
  it("detects full log requests", () => {
    assert.equal(wantsFullDailyLogQuote("can you show us full log"), true);
    assert.equal(wantsFullDailyLogQuote("what invoices are due"), false);
  });
});
