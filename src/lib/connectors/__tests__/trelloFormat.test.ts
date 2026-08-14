import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectPdfAttachmentsFromCards,
  isPdfAttachment,
} from "../trello/attachments.ts";
import { formatBoardAsAnalysisText } from "../trello/formatBoard.ts";

describe("trello pdf attachments", () => {
  it("detects PDFs by mime, name, or url", () => {
    assert.equal(isPdfAttachment({ mimeType: "application/pdf" }), true);
    assert.equal(isPdfAttachment({ name: "chords.PDF" }), true);
    assert.equal(
      isPdfAttachment({ url: "https://trello.com/1/cards/x/attachments/y/download/a.pdf" }),
      true
    );
    assert.equal(isPdfAttachment({ name: "photo.png", mimeType: "image/png" }), false);
  });

  it("collects PDF attachments from open cards only", () => {
    const pdfs = collectPdfAttachmentsFromCards({
      boardId: "b1",
      boardName: "Living Waters",
      cards: [
        {
          id: "c1",
          name: "Setlist",
          closed: false,
          attachments: [
            {
              id: "a1",
              name: "chords.pdf",
              mimeType: "application/pdf",
              url: "https://example.com/chords.pdf",
              bytes: 12000,
            },
            {
              id: "a2",
              name: "cover.jpg",
              mimeType: "image/jpeg",
              url: "https://example.com/cover.jpg",
            },
          ],
        },
        {
          id: "c2",
          name: "Archived",
          closed: true,
          attachments: [
            {
              id: "a3",
              name: "old.pdf",
              mimeType: "application/pdf",
              url: "https://example.com/old.pdf",
            },
          ],
        },
      ],
    });
    assert.equal(pdfs.length, 1);
    assert.equal(pdfs[0]?.attachmentId, "a1");
    assert.equal(pdfs[0]?.cardName, "Setlist");
  it("skips external link PDFs when uploadedOnly", () => {
    const pdfs = collectPdfAttachmentsFromCards({
      boardId: "b1",
      boardName: "Board",
      uploadedOnly: true,
      cards: [
        {
          id: "c1",
          name: "Card",
          closed: false,
          attachments: [
            {
              id: "a1",
              name: "local.pdf",
              mimeType: "application/pdf",
              isUpload: true,
              url: "https://trello.com/1/cards/c1/attachments/a1/download/local.pdf",
            },
            {
              id: "a2",
              name: "drive.pdf",
              mimeType: "application/pdf",
              isUpload: false,
              url: "https://drive.google.com/file/x",
            },
          ],
        },
      ],
    });
    assert.equal(pdfs.length, 1);
    assert.equal(pdfs[0]?.attachmentId, "a1");
  });
});

describe("trello board formatting", () => {
  it("includes attachment lines for cards", () => {
    const text = formatBoardAsAnalysisText({
      name: "Living Waters",
      lists: [{ id: "l1", name: "Doing" }],
      cards: [
        {
          id: "c1",
          idList: "l1",
          name: "Practice set",
          closed: false,
          attachments: [
            {
              id: "a1",
              name: "chords.pdf",
              mimeType: "application/pdf",
              url: "https://trello.com/att/chords.pdf",
            },
          ],
        },
      ],
    });
    assert.match(text, /attachment \(PDF\): chords\.pdf/);
  });
});
