import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isImageFileName,
  wantsShowPictures,
  wantsSingleImageFocus,
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
    assert.equal(wantsShowPictures("show Nolans summer camp flyer"), true);
    assert.equal(wantsShowPictures("What does the invoice say?"), false);
    assert.equal(
      wantsShowPictures(
        "What do you see in this image? Describe the scene and call out any readable text."
      ),
      false
    );
    assert.equal(wantsShowPictures("Can I see the photos from the event?"), true);
  });

  it("detects single-image focus", () => {
    assert.equal(
      wantsSingleImageFocus("What do you see in this image?"),
      true
    );
    assert.equal(wantsSingleImageFocus("show me all the photos"), false);
  });
});
