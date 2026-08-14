import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectChartAttachmentsFromCards,
  collectPdfAttachmentsFromCards,
  isChartAttachment,
  isImageAttachment,
  isPdfAttachment,
  pickUniqueChartsForAnalyze,
} from "../trello/attachments.ts";
import { formatBoardAsAnalysisText } from "../trello/formatBoard.ts";

describe("trello pdf attachments", () => {
  it("detects PDFs by mime, name, or url", () => {
    assert.equal(isPdfAttachment({ mimeType: "application/pdf" }), true);
    assert.equal(isPdfAttachment({ name: "chords.PDF" }), true);
    assert.equal(
      isPdfAttachment({
        url: "https://trello.com/1/cards/x/attachments/y/download/a.pdf",
      }),
      true
    );
    assert.equal(
      isPdfAttachment({ name: "photo.png", mimeType: "image/png" }),
      false
    );
  });

  it("detects chord-chart images by mime, name, or url", () => {
    assert.equal(isImageAttachment({ mimeType: "image/jpeg" }), true);
    assert.equal(isImageAttachment({ name: "chords.JPG" }), true);
    assert.equal(
      isImageAttachment({
        url: "https://trello.com/1/cards/x/attachments/y/download/chart.png",
      }),
      true
    );
    assert.equal(isChartAttachment({ name: "verse.jpg" }), true);
    assert.equal(isChartAttachment({ name: "notes.pdf" }), true);
    assert.equal(isImageAttachment({ name: "notes.pdf" }), false);
  });

  it("collects PDF and JPG attachments from open cards", () => {
    const charts = collectChartAttachmentsFromCards({
      boardId: "b1",
      boardName: "Living Waters",
      cards: [
        {
          id: "c1",
          name: "Ibadat Karo - Gm",
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
              name: "old.jpg",
              mimeType: "image/jpeg",
              url: "https://example.com/old.jpg",
            },
          ],
        },
      ],
    });
    assert.equal(charts.length, 2);
    assert.equal(charts[0]?.attachmentId, "a1");
    assert.equal(charts[1]?.attachmentId, "a2");
    assert.equal(charts[1]?.mimeType, "image/jpeg");
    assert.equal(charts[1]?.cardName, "Ibadat Karo - Gm");
  });

  it("dedupes the same chart filename across cards", () => {
    const charts = collectChartAttachmentsFromCards({
      boardId: "b1",
      boardName: "Living Waters",
      cards: [
        {
          id: "c1",
          name: "Asha Meri",
          closed: false,
          attachments: [
            {
              id: "a1",
              name: "Asha Meri - Eb5 - Short version.jpg",
              mimeType: "image/jpeg",
              bytes: 90000,
              date: "2024-01-01T00:00:00.000Z",
              url: "https://example.com/a1.jpg",
            },
          ],
        },
        {
          id: "c2",
          name: "Asha Meri copy",
          closed: false,
          attachments: [
            {
              id: "a2",
              name: "Asha Meri - Eb5 - Short version.jpg",
              mimeType: "image/jpeg",
              bytes: 90000,
              date: "2024-06-01T00:00:00.000Z",
              url: "https://example.com/a2.jpg",
            },
            {
              id: "a3",
              name: "Asha Meri - Eb5 - Short version.jpg",
              mimeType: "image/jpeg",
              bytes: 90000,
              date: "2024-03-01T00:00:00.000Z",
              url: "https://example.com/a3.jpg",
            },
          ],
        },
      ],
    });
    assert.equal(charts.length, 1);
    assert.equal(charts[0]?.attachmentId, "a2");
  });

  it("keeps same-name charts when file size differs", () => {
    const charts = collectChartAttachmentsFromCards({
      boardId: "b1",
      boardName: "Living Waters",
      cards: [
        {
          id: "c1",
          name: "Song",
          closed: false,
          attachments: [
            {
              id: "a1",
              name: "Silent Night.jpg",
              mimeType: "image/jpeg",
              bytes: 1000,
              url: "https://example.com/a1.jpg",
            },
            {
              id: "a2",
              name: "Silent Night.jpg",
              mimeType: "image/jpeg",
              bytes: 2000,
              url: "https://example.com/a2.jpg",
            },
          ],
        },
      ],
    });
    assert.equal(charts.length, 2);
  });

  it("skips analyze duplicates when one copy is already analyzed", () => {
    const unique = pickUniqueChartsForAnalyze([
      {
        name: "Asha Meri - Eb5 - Short version.jpg",
        sizeBytes: 90000,
        processingStatus: "analyzed",
      },
      {
        name: "Asha Meri - Eb5 - Short version.jpg",
        sizeBytes: 90000,
        processingStatus: "discovered",
      },
      {
        name: "As the deer - C.jpg",
        sizeBytes: 1000,
        processingStatus: "discovered",
      },
    ]);
    assert.equal(unique.length, 2);
    assert.equal(unique[0]?.processingStatus, "analyzed");
    assert.equal(unique[1]?.name, "As the deer - C.jpg");
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
    assert.equal(pdfs[0]?.boardName, "Living Waters");
  });

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

  it("puts a CARD INDEX of every open card before details", () => {
    const text = formatBoardAsAnalysisText({
      name: "Living Waters",
      lists: [{ id: "l1", name: "Songs" }],
      cards: [
        { id: "c1", idList: "l1", name: "Ae reethi", closed: false },
        { id: "c2", idList: "l1", name: "Deevinchaevae", closed: false },
        { id: "c3", idList: "l1", name: "Archived one", closed: true },
      ],
    });
    assert.match(text, /CARD INDEX \(2 items/);
    assert.match(text, /\* \[Songs\] Ae reethi/);
    assert.match(text, /\* \[Songs\] Deevinchaevae/);
    assert.doesNotMatch(text, /Archived one/);
    const indexAt = text.indexOf("CARD INDEX");
    const detailsAt = text.indexOf("Card details:");
    assert.ok(indexAt >= 0 && detailsAt > indexAt);
  });

  it("keeps chord-chart line breaks and checklists in card details", () => {
    const text = formatBoardAsAnalysisText({
      name: "Living Waters",
      lists: [{ id: "l1", name: "Songs" }],
      checklists: [
        {
          id: "cl1",
          name: "Progression",
          idCard: "c1",
          checkItems: [{ name: "Intro Gm" }, { name: "Verse Cm" }],
        },
      ],
      cards: [
        {
          id: "c1",
          idList: "l1",
          name: "Ibadat Karo - Gm - Nov 21, 2021",
          closed: false,
          desc: "Verse:\nGm Cm D7\nChorus:\nEb F Gm",
        },
      ],
    });
    assert.match(text, /Verse:/);
    assert.match(text, /Gm Cm D7/);
    assert.match(text, /checklist "Progression":/);
    assert.match(text, /- Intro Gm/);
  });
});
