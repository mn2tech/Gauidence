import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  enrichAnalysisFromImageTranscription,
  listLinesFromTranscription,
  looksLikeListTranscription,
} from "../imageNotes.ts";
import { wantsTranscription } from "../../vault/gideon.ts";

describe("image note transcription", () => {
  it("detects multi-line list OCR", () => {
    const text = "Creepy Pair of Underwear\nThe Creepy Crayon!\nDavid";
    assert.equal(looksLikeListTranscription(text), true);
    assert.deepEqual(listLinesFromTranscription(text), [
      "Creepy Pair of Underwear",
      "The Creepy Crayon!",
      "David",
    ]);
  });

  it("adds list lines as searchable facts", () => {
    const enriched = enrichAnalysisFromImageTranscription(
      {
        document_type: "general",
        title: "",
        summary: "",
        facts: [],
        people: [],
        organizations: [],
        important_dates: [],
        amounts: [],
        obligations: [],
        suggested_actions: [],
        warnings: [],
        guardian_status: "completed",
        overall_confidence: 0.9,
        specialist: {},
      },
      "Apples\nBananas\nCherries"
    );
    assert.match(enriched.summary ?? "", /3 items/i);
    assert.equal(enriched.facts.length, 3);
    assert.equal(enriched.facts[0]?.value, "Apples");
  });
});

describe("wantsTranscription", () => {
  it("matches transcribe and list requests", () => {
    assert.equal(wantsTranscription("Transcribe my book list photo"), true);
    assert.equal(wantsTranscription("What does this note say?"), true);
    assert.equal(wantsTranscription("When is my passport due?"), false);
  });
});
