import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVisionSourceText,
  emptyOcrIsSuccessfulAnalysis,
  factFingerprint,
  isUsefulVisionResult,
  mapVisionDocumentType,
  mapVisionResultToAnalysis,
} from "../mapAnalysis.ts";
import { parseVisionResult } from "../schema.ts";
import type { VisionResult } from "../types.ts";

function sample(overrides: Partial<VisionResult> = {}): VisionResult {
  return {
    document_type: "vehicle_service_invoice",
    description: "A Mini Cooper service invoice showing maintenance performed.",
    transcription: "Oil change $129.95",
    summary: "The Mini Cooper received an oil change and inspection.",
    entities: [
      { type: "vehicle", name: "Mini Cooper", confidence: 0.94 },
      { type: "organization", name: "Example Auto Service", confidence: 0.9 },
    ],
    dates: [{ value: "2026-08-18", context: "service date", confidence: 0.92 }],
    amounts: [
      {
        value: 129.95,
        currency: "USD",
        context: "invoice total",
        confidence: 0.93,
      },
    ],
    facts: [
      {
        predicate: "received_service",
        subject: "Mini Cooper",
        object: "Oil Change",
        confidence: 0.94,
      },
    ],
    tasks: [],
    confidence: 0.93,
    ...overrides,
  };
}

describe("Guardian Vision result mapping", () => {
  it("does not treat empty OCR as successful analysis", () => {
    assert.equal(emptyOcrIsSuccessfulAnalysis(""), false);
    assert.equal(emptyOcrIsSuccessfulAnalysis("   "), false);
    assert.equal(emptyOcrIsSuccessfulAnalysis(null), false);
    assert.equal(emptyOcrIsSuccessfulAnalysis("Total $12.00"), true);
  });

  it("Test 5: zero OCR text can still be useful when a description exists", () => {
    const noText = sample({
      transcription: "",
      description: "A handwritten packing list on a yellow notepad.",
      summary: "A packing list with several items.",
      entities: [],
      dates: [],
      amounts: [],
      facts: [],
    });
    assert.equal(isUsefulVisionResult(noText), true);
    assert.equal(emptyOcrIsSuccessfulAnalysis(noText.transcription), false);
  });

  it("rejects a completely empty vision result", () => {
    assert.equal(
      isUsefulVisionResult(
        sample({
          document_type: "unknown",
          description: "",
          transcription: "",
          summary: "",
          entities: [],
          dates: [],
          amounts: [],
          facts: [],
          tasks: [],
          confidence: 0,
        })
      ),
      false
    );
  });

  it("maps a vehicle invoice into Guardian analysis with provenance specialist fields", () => {
    const analysis = mapVisionResultToAnalysis(sample(), "service_invoice.jpg");
    assert.equal(analysis.document_type, "invoice");
    assert.match(analysis.summary, /Mini Cooper/);
    assert.ok(analysis.facts.some((f) => /129\.95/.test(f.value)));
    assert.ok(analysis.organizations.includes("Example Auto Service"));
    assert.equal(analysis.specialist.source_type, "image");
    assert.equal(analysis.specialist.analysis_type, "vision");
  });

  it("maps screenshot / receipt / letter types", () => {
    assert.equal(mapVisionDocumentType("screenshot"), "general");
    assert.equal(mapVisionDocumentType("store_receipt"), "receipt");
    assert.equal(mapVisionDocumentType("school_notice"), "general");
  });

  it("builds searchable source text with content type image and capped transcription", () => {
    const text = buildVisionSourceText(
      sample({ transcription: "A".repeat(6_000) }),
      "photo.jpg"
    );
    assert.match(text, /Content type: image/);
    assert.match(text, /Mini Cooper/);
    assert.ok(text.includes("Transcription:"));
    assert.ok(text.length < 8_000);
  });

  it("dedupes fact fingerprints on reanalysis", () => {
    const a = factFingerprint({
      predicate: "received_service",
      subject: "Mini Cooper",
      object: "Oil Change",
    });
    const b = factFingerprint({
      predicate: "received_service",
      subject: "mini   cooper",
      object: "oil change",
    });
    assert.equal(a, b);
  });

  it("parses unknown fields as empty instead of hallucinating", () => {
    const parsed = parseVisionResult({ document_type: "photo" });
    assert.equal(parsed.description, "");
    assert.equal(parsed.transcription, "");
    assert.deepEqual(parsed.entities, []);
    assert.deepEqual(parsed.facts, []);
  });

  it("drops low-confidence entities rather than presenting them as fact", () => {
    const analysis = mapVisionResultToAnalysis(
      sample({
        entities: [{ type: "person", name: "Maybe Bob", confidence: 0.2 }],
      }),
      "note.jpg"
    );
    assert.equal(analysis.people.includes("Maybe Bob"), false);
  });
});
