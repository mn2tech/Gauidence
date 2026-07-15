import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isImageFileName,
  wantsShowPictures,
} from "../images.ts";

describe("vault image helpers", () => {
  it("detects common image file names", () => {
    assert.equal(isImageFileName("receipt.jpg"), true);
    assert.equal(isImageFileName("scan.PNG"), true);
    assert.equal(isImageFileName("doc.pdf"), false);
  });

  it("detects show-pictures intent", () => {
    assert.equal(wantsShowPictures("show me pictures of the receipt"), true);
    assert.equal(wantsShowPictures("Can you show the photos?"), true);
    assert.equal(wantsShowPictures("What does the invoice say?"), false);
  });
});
