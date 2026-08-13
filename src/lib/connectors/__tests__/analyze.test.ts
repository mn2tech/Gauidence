import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  guessMimeFromName,
  isAnalyzeSupportedMime,
} from "../content/types";
import { buildFileIndex } from "../content/readClient";
import {
  isItemAnalyzable,
  isItemNeedsAnalyze,
} from "../clientAnalyze";
import {
  normalizeRelationshipType,
  ONTOLOGY_ENTITY_TYPES,
  reviewStatusForConfidence,
} from "@/lib/ontology/types";

describe("connector analyze support", () => {
  it("accepts pdf, text, csv, json, images, excel", () => {
    assert.equal(isAnalyzeSupportedMime("application/pdf", "a.pdf"), true);
    assert.equal(isAnalyzeSupportedMime("text/plain", "a.txt"), true);
    assert.equal(isAnalyzeSupportedMime("text/csv", "a.csv"), true);
    assert.equal(isAnalyzeSupportedMime("application/json", "a.json"), true);
    assert.equal(isAnalyzeSupportedMime(undefined, "export.json"), true);
    assert.equal(isAnalyzeSupportedMime("image/jpeg", "a.jpg"), true);
    assert.equal(
      isAnalyzeSupportedMime(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "a.xlsx"
      ),
      true
    );
    assert.equal(isAnalyzeSupportedMime(undefined, "report.xls"), true);
    assert.equal(isAnalyzeSupportedMime("application/zip", "a.zip"), false);
  });

  it("guesses mime from filename", () => {
    assert.equal(guessMimeFromName("receipt.PDF"), "application/pdf");
    assert.equal(guessMimeFromName("notes.txt"), "text/plain");
    assert.equal(guessMimeFromName("export.JSON"), "application/json");
    assert.equal(
      guessMimeFromName("Kpactech02-2.xlsx"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("selects batch-eligible items", () => {
    assert.equal(
      isItemNeedsAnalyze({
        name: "a.pdf",
        mimeType: "application/pdf",
        processingStatus: "discovered",
      }),
      true
    );
    assert.equal(
      isItemNeedsAnalyze({
        name: "a.pdf",
        mimeType: "application/pdf",
        processingStatus: "analyzed",
      }),
      false
    );
    assert.equal(
      isItemAnalyzable({
        name: "a.pdf",
        mimeType: "application/pdf",
        processingStatus: "analyzed",
      }),
      true
    );
    assert.equal(
      isItemAnalyzable({
        name: "a.zip",
        mimeType: "application/zip",
        processingStatus: "discovered",
      }),
      false
    );
    assert.equal(
      isItemAnalyzable({
        name: "a.pdf",
        mimeType: "application/pdf",
        processingStatus: "unavailable",
      }),
      false
    );
  });

  it("indexes webkitdirectory paths for batch reads", () => {
    const file = new File(["x"], "invoice.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "January/invoice.pdf",
    });
    const index = buildFileIndex([file]);
    assert.equal(index.get("january/invoice.pdf"), file);
    assert.equal(index.get("invoice.pdf"), file);
  });
});

describe("connector ontology vocabulary", () => {
  it("includes personal entity types", () => {
    assert.ok(ONTOLOGY_ENTITY_TYPES.includes("event"));
    assert.ok(ONTOLOGY_ENTITY_TYPES.includes("restaurant"));
    assert.ok(ONTOLOGY_ENTITY_TYPES.includes("place"));
  });

  it("normalizes personal relationship types", () => {
    assert.equal(normalizeRelationshipType("OCCURRED_AT"), "OCCURRED_AT");
    assert.equal(normalizeRelationshipType("dinner_at"), "OCCURRED_AT");
    assert.equal(normalizeRelationshipType("PURCHASED_FROM"), "PURCHASED_FROM");
    assert.equal(normalizeRelationshipType("WATCHED"), "WATCHED");
  });

  it("maps confidence to review status for connector sources", () => {
    assert.equal(reviewStatusForConfidence(0.95, "connector"), "confirmed");
    assert.equal(reviewStatusForConfidence(0.8, "connector"), "pending");
    assert.equal(
      reviewStatusForConfidence(0.99, "connector", "RELATED_TO"),
      "pending"
    );
  });
});
