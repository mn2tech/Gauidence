import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isHeicAsset,
  isImageAsset,
  routeAssetKind,
  shouldAnalyzeImageWithVision,
} from "../routeAsset.ts";

describe("Guardian Vision asset routing", () => {
  it("routes jpeg/png/webp/heic to image vision", () => {
    assert.equal(routeAssetKind("image/jpeg", "photo.jpg"), "image");
    assert.equal(routeAssetKind("image/png", "shot.png"), "image");
    assert.equal(routeAssetKind("image/webp", "a.webp"), "image");
    assert.equal(routeAssetKind("image/heic", "IMG_001.HEIC"), "image");
    assert.equal(shouldAnalyzeImageWithVision("image/jpeg"), true);
  });

  it("routes PDFs and Word docs away from vision", () => {
    assert.equal(routeAssetKind("application/pdf", "letter.pdf"), "pdf");
    assert.equal(
      routeAssetKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "notes.docx"
      ),
      "document"
    );
    assert.equal(shouldAnalyzeImageWithVision("application/pdf"), false);
  });

  it("detects HEIC from mime or extension", () => {
    assert.equal(isHeicAsset("image/heic"), true);
    assert.equal(isHeicAsset("image/jpeg", "scan.heic"), true);
    assert.equal(isHeicAsset("image/jpeg", "scan.jpg"), false);
  });

  it("treats image/* as an image asset even without a filename", () => {
    assert.equal(isImageAsset("image/png"), true);
  });
});
