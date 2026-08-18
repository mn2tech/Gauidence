import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attachmentsFromUserCitations,
  citationFromDocument,
  hydrateVaultChatMessage,
  hydrateVaultChatMessages,
} from "../chatAttachments.ts";

describe("vault chat attachments", () => {
  it("maps user citations to persistent document attachments", () => {
    const attachments = attachmentsFromUserCitations([
      {
        documentId: "doc-1",
        fileName: "invoice.jpg",
        isImage: true,
        mimeType: "image/jpeg",
      },
      {
        documentId: "doc-1",
        fileName: "invoice.jpg",
        isImage: true,
      },
      {
        documentId: "trello-1",
        fileName: "chart.pdf",
        kind: "connector",
      },
    ]);
    assert.equal(attachments.length, 1);
    assert.deepEqual(attachments[0], {
      documentId: "doc-1",
      fileName: "invoice.jpg",
      kind: "image",
      mimeType: "image/jpeg",
    });
  });

  it("hydrates user messages from citations so history can render without blob URLs", () => {
    const hydrated = hydrateVaultChatMessage({
      id: "m1",
      role: "user",
      content: "What does this say?",
      citations: [
        {
          documentId: "doc-9",
          fileName: "service.jpg",
          isImage: true,
          mimeType: "image/jpeg",
        },
      ],
      created_at: "2026-08-18T00:00:00.000Z",
    });
    assert.equal(hydrated.attachments?.length, 1);
    assert.equal(hydrated.attachment?.documentId, "doc-9");
    assert.equal(hydrated.attachment?.kind, "image");
    assert.equal(hydrated.attachment?.previewUrl ?? null, null);
  });

  it("keeps an optimistic preview overlay after server citations arrive", () => {
    const hydrated = hydrateVaultChatMessage({
      id: "m1",
      role: "user",
      content: "What does this say?",
      citations: [
        {
          documentId: "doc-9",
          fileName: "service.jpg",
          isImage: true,
        },
      ],
      attachment: {
        documentId: "doc-9",
        fileName: "service.jpg",
        kind: "image",
        previewUrl: "blob:http://localhost/preview",
      },
      created_at: "2026-08-18T00:00:00.000Z",
    });
    assert.equal(hydrated.attachment?.previewUrl, "blob:http://localhost/preview");
    assert.equal(hydrated.attachment?.documentId, "doc-9");
  });

  it("does not treat assistant source citations as the user bubble attachment", () => {
    const hydrated = hydrateVaultChatMessage({
      id: "a1",
      role: "assistant",
      content: "This is a service invoice.",
      citations: [
        {
          documentId: "doc-9",
          fileName: "service.jpg",
          isImage: true,
        },
      ],
      created_at: "2026-08-18T00:00:00.000Z",
    });
    assert.deepEqual(hydrated.attachments, []);
    assert.equal(hydrated.attachment, null);
  });

  it("hydrates a reloaded thread the way loadThread replaces local messages", () => {
    const serverRows = hydrateVaultChatMessages([
      {
        id: "u1",
        role: "user",
        content: "What service did I receive?",
        citations: [
          {
            documentId: "asset-1",
            fileName: "mini-cooper.jpg",
            isImage: true,
            mimeType: "image/jpeg",
          },
        ],
        created_at: "2026-08-18T00:00:00.000Z",
      },
      {
        id: "a1",
        role: "assistant",
        content: "Oil change and inspection.",
        citations: [
          {
            documentId: "asset-1",
            fileName: "mini-cooper.jpg",
            isImage: true,
          },
        ],
        created_at: "2026-08-18T00:00:01.000Z",
      },
    ]);
    assert.equal(serverRows[0]?.attachment?.documentId, "asset-1");
    assert.equal(serverRows[0]?.attachments?.length, 1);
    assert.equal(serverRows[1]?.attachment, null);
  });

  it("builds a citation from a Guardian document row", () => {
    const citation = citationFromDocument({
      id: "d1",
      file_name: "note.heic",
      mime_type: "image/heic",
    });
    assert.equal(citation.isImage, true);
    assert.equal(citation.documentId, "d1");
  });
});
