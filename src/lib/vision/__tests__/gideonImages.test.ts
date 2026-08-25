import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  lastImageAttachmentId,
  mentionsReupload,
  resolveGideonImageAttachmentId,
  selectRetrievedImageDocumentIds,
  shouldAskForUpload,
  shouldAttachRetrievedImages,
  uniqueImageDocumentIds,
  wantsVisualUnderstanding,
} from "../gideonImages.ts";

describe("Gideon vision image selection", () => {
  it("detects visual questions about the current image", () => {
    assert.equal(wantsVisualUnderstanding("What is this?"), true);
    assert.equal(wantsVisualUnderstanding("Read this for me."), true);
    assert.equal(wantsVisualUnderstanding("How much did I spend?"), true);
    assert.equal(
      wantsVisualUnderstanding("What service did my Mini Cooper receive?"),
      true
    );
    assert.equal(wantsVisualUnderstanding("What is the Pomodoro technique?"), false);
  });

  it("Test 6: reuses the current-chat image when no new attachment is sent", () => {
    const id = resolveGideonImageAttachmentId({
      requestedId: null,
      question: "What does this receipt say?",
      priorMessages: [
        {
          role: "user",
          content: "uploaded",
          citations: [
            {
              documentId: "img-1",
              fileName: "receipt.jpg",
              isImage: true,
            },
          ],
        },
      ],
    });
    assert.equal(id, "img-1");
  });

  it("Test 7: prefers an explicit request id for an existing Space image", () => {
    const id = resolveGideonImageAttachmentId({
      requestedId: "space-img",
      question: "What does this Mini Cooper document say?",
      priorMessages: [],
    });
    assert.equal(id, "space-img");
  });

  it("never asks for a re-upload when Guardian already has the file", () => {
    assert.equal(
      shouldAskForUpload({ hasAttachment: true, hasRetrievedImage: false }),
      false
    );
    assert.equal(
      shouldAskForUpload({ hasAttachment: false, hasRetrievedImage: true }),
      false
    );
    assert.equal(
      shouldAskForUpload({ hasAttachment: false, hasRetrievedImage: false }),
      true
    );
  });

  it("flags model replies that ask the user to re-upload", () => {
    assert.equal(
      mentionsReupload("If you re-upload it, I'll transcribe it."),
      true
    );
    assert.equal(mentionsReupload("The total is $12.49."), false);
  });

  it("attaches at most 3 unique retrieved images", () => {
    const ids = uniqueImageDocumentIds(
      ["a", "a", "b", "c", "d", null, ""],
      3
    );
    assert.deepEqual(ids, ["a", "b", "c"]);
  });

  it("selects retrieved image docs and excludes the current attachment", () => {
    const ids = selectRetrievedImageDocumentIds({
      chunks: [
        {
          document_id: "current",
          file_name: "this.jpg",
          similarity: 0.99,
        },
        {
          document_id: "other",
          file_name: "invoice.png",
          similarity: 0.8,
        },
        {
          document_id: "pdf",
          file_name: "letter.pdf",
          similarity: 0.95,
        },
      ],
      excludeIds: ["current"],
      limit: 2,
    });
    assert.deepEqual(ids, ["other"]);
  });

  it("does not pull past Space images when one image is already attached", () => {
    assert.equal(
      shouldAttachRetrievedImages({
        hasAttachedImage: true,
        showPictures: false,
      }),
      false
    );
    assert.equal(
      shouldAttachRetrievedImages({
        hasAttachedImage: true,
        showPictures: true,
      }),
      true
    );
    assert.equal(
      shouldAttachRetrievedImages({
        hasAttachedImage: false,
        showPictures: false,
      }),
      true
    );
  });

  it("Test 8: lastImageAttachmentId returns nothing without citations", () => {
    assert.equal(lastImageAttachmentId([{ role: "user", content: "hi" }]), null);
  });
});
